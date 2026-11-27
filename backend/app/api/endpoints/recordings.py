from app.core.organization_context import scoped_path
import os
import uuid
import re
import tempfile
import shutil
import mimetypes
from starlette.datastructures import Headers
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, Query, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core import deps
from app.core.audit import log_action
from app.core.config import settings
from app.core.subscriptions import storage_write
from app.models.models import Meeting, MeetingStatus, Recording, User, UserRole
from app.services.audio import compress_speech_webm, validate_media_file

router = APIRouter()


def _can_read(meeting: Meeting, user: User) -> bool:
    if user.role in {UserRole.admin, UserRole.minute_secretary}:
        return True
    if user.role == UserRole.staff and meeting.status == MeetingStatus.completed:
        return True
    if meeting.owner_id == user.id:
        return True
    return user.email in {p.email for p in meeting.participants if p.email}


@router.post("/upload/{meeting_id}")
def upload_recording(
    meeting_id: int,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_minutes_editor),
):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).with_for_update().first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if current_user.role != UserRole.admin and meeting.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="You do not have permission to upload files for this meeting")

    if meeting.status in {MeetingStatus.processing, MeetingStatus.completed} or (Path(settings.EXPORT_DIR)/f"meeting-{meeting_id}-final-minutes.pdf").is_file():
        raise HTTPException(409, "Recording cannot be replaced while processing or after minutes completion")
    file.file.seek(0, os.SEEK_END)
    file_size = file.file.tell()
    file.file.seek(0)
    valid, error = validate_media_file(file.filename or "", file_size, file.content_type)
    if not valid:
        raise HTTPException(status_code=400, detail=error)

    with storage_write(file_size):
        os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
        extension = Path(file.filename or "").suffix.lower()
        saved_path = os.path.join(settings.UPLOAD_DIR, f"raw_{meeting_id}_{str(uuid.uuid4())[:8]}{extension}")
        try:
            with open(saved_path, "wb") as output:
                while True:
                    chunk = file.file.read(1024 * 1024)
                    if not chunk:
                        break
                    output.write(chunk)
        except Exception as exc:
            if os.path.exists(saved_path):
                os.remove(saved_path)
            raise HTTPException(status_code=500, detail=f"Failed to write recording: {exc}") from exc
    
        stored_path = saved_path
        stored_filename = file.filename or "recording"
        stored_size = file_size
        stored_mime = file.content_type
    
        # Browser live meetings arrive as WebM. Keep speech clear but reduce storage
        # dramatically by storing mono 16 kHz Opus at 32 kbps.
        if extension == ".webm" and not settings.TENANT_ID:
            compact_path = os.path.join(settings.UPLOAD_DIR, f"meeting_{meeting_id}_{str(uuid.uuid4())[:8]}.webm")
            if compress_speech_webm(saved_path, compact_path):
                try:
                    os.remove(saved_path)
                except OSError:
                    pass
                stored_path = compact_path
                stored_filename = f"meeting-{meeting_id}.webm"
                stored_size = os.path.getsize(compact_path)
                stored_mime = "audio/webm"
    
        existing = db.query(Recording).filter(Recording.meeting_id == meeting_id).first()
        old_path = str(scoped_path(existing.filepath)) if existing else None
        if existing:
            db.delete(existing)
            db.flush()
        recording = Recording(
            meeting_id=meeting_id,
            filename=stored_filename,
            filepath=stored_path,
            file_size_bytes=stored_size,
            mime_type=stored_mime,
            uploaded_by_id=current_user.id,
        )
        db.add(recording)
        meeting.status = MeetingStatus.draft
        db.commit()
        db.refresh(recording)
        if old_path and old_path != stored_path and os.path.exists(old_path):
            try:
                os.remove(old_path)
            except OSError:
                pass
    log_action(db, action="upload_recording", details=f"Uploaded {recording.filename} for meeting {meeting_id}", user_id=current_user.id, user_email=current_user.email, ip_address=request.client.host if request.client else None)
    return {"id": recording.id, "meeting_id": recording.meeting_id, "filename": recording.filename, "file_size_bytes": recording.file_size_bytes, "mime_type": recording.mime_type}


# Resumable, bounded upload parts. All paths are organization and editor scoped.
_PART_SIZE = 1024 * 1024
_MAX_PARTS = 500

def _upload_scope(db, meeting_id, user, upload_id):
    if not re.fullmatch(r"[a-f0-9]{64}", upload_id):
        raise HTTPException(422, "Invalid upload identifier")
    meeting = db.query(Meeting).filter_by(id=meeting_id).first()
    if not meeting:
        raise HTTPException(404, "Meeting not found")
    if user.role != UserRole.admin and meeting.owner_id != user.id:
        raise HTTPException(403, "Not authorized to upload for this meeting")
    path = Path(settings.UPLOAD_DIR) / ".resumable" / f"{meeting_id}-{user.id}" / upload_id
    return meeting, path

@router.get("/resume/{meeting_id}/{upload_id}")
def upload_progress(meeting_id: int, upload_id: str, db: Session = Depends(deps.get_db), current_user: User = Depends(deps.get_minutes_editor)):
    meeting, path = _upload_scope(db, meeting_id, current_user, upload_id)
    completed = bool(meeting.recording and meeting.recording.filename.startswith(f"meeting-{meeting_id}-{upload_id[:24]}."))
    return {"completed":completed,"parts": sorted(int(p.stem) for p in path.glob("*.part") if p.stem.isdigit())}

@router.put("/resume/{meeting_id}/{upload_id}/{index}")
def upload_part(meeting_id: int, upload_id: str, index: int, file: UploadFile = File(...), db: Session = Depends(deps.get_db), current_user: User = Depends(deps.get_minutes_editor)):
    meeting, path = _upload_scope(db, meeting_id, current_user, upload_id)
    if meeting.status in {MeetingStatus.processing, MeetingStatus.completed}:
        raise HTTPException(409, "Recording already processing or completed")
    if not 0 <= index < _MAX_PARTS:
        raise HTTPException(422, "Invalid part index")
    data = file.file.read(_PART_SIZE + 1)
    if not data or len(data) > _PART_SIZE:
        raise HTTPException(413, "Each upload part must be between 1 byte and 1 MiB")
    target = path / f"{index}.part"
    if target.is_file():
        if target.read_bytes() != data:
            raise HTTPException(409, "Upload part differs from previous attempt")
        return {"stored": index}
    with storage_write(len(data)):
        path.mkdir(parents=True, exist_ok=True)
        temp = path / (str(uuid.uuid4()) + ".tmp")
        try:
            temp.write_bytes(data)
            if target.exists() and target.read_bytes() != data:
                raise HTTPException(409, "Conflicting upload part")
            temp.replace(target)
        finally:
            temp.unlink(missing_ok=True)
    return {"stored": index}

@router.post("/resume/{meeting_id}/{upload_id}/complete")
def complete_upload(meeting_id: int, upload_id: str, request: Request, count: int = Query(ge=1, le=_MAX_PARTS), filename: str = Query(max_length=255), db: Session = Depends(deps.get_db), current_user: User = Depends(deps.get_minutes_editor)):
    meeting, path = _upload_scope(db, meeting_id, current_user, upload_id)
    # Stable filename makes an ambiguous successful completion safe to repeat.
    ext = Path(filename).suffix.lower()
    stable = f"meeting-{meeting_id}-{upload_id[:24]}{ext}"
    if meeting.recording and meeting.recording.filename == stable:
        shutil.rmtree(path, ignore_errors=True)
        return {"id": meeting.recording.id, "meeting_id": meeting_id, "filename": stable, "file_size_bytes": meeting.recording.file_size_bytes}
    parts = [path / f"{i}.part" for i in range(count)]
    if any(not p.is_file() for p in parts):
        raise HTTPException(409, "Upload incomplete; retry missing parts")
    if any(p.stat().st_size != _PART_SIZE for p in parts[:-1]):
        raise HTTPException(422, "Invalid intermediate part size")
    total = sum(p.stat().st_size for p in parts)
    valid, error = validate_media_file(stable, total, "")
    if not valid:
        raise HTTPException(400, error)
    with tempfile.TemporaryFile() as assembled:
        for p in parts:
            with p.open("rb") as source:
                shutil.copyfileobj(source, assembled, _PART_SIZE)
        assembled.seek(0)
        result = upload_recording(meeting_id, request, UploadFile(file=assembled, filename=stable, headers=Headers({"content-type":mimetypes.guess_type(stable)[0] or "audio/webm"})), db, current_user)
    shutil.rmtree(path, ignore_errors=True)
    return result


def _recording_or_404(recording_id: int, db: Session, user: User) -> Recording:
    recording = db.query(Recording).filter(Recording.id == recording_id).first()
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")
    if not _can_read(recording.meeting, user):
        raise HTTPException(status_code=403, detail="You are not authorised to access this recording")
    if not scoped_path(recording.filepath).is_file():
        raise HTTPException(status_code=404, detail="Physical audio file is missing from storage")
    return recording


@router.get("/{recording_id}/download")
def download_recording(recording_id: int, db: Session = Depends(deps.get_db), current_user: User = Depends(deps.get_current_user)):
    recording = _recording_or_404(recording_id, db, current_user)
    return FileResponse(path=recording.filepath, media_type=recording.mime_type or "application/octet-stream", filename=recording.filename)


@router.get("/{recording_id}/play")
def play_recording(recording_id: int, db: Session = Depends(deps.get_db), current_user: User = Depends(deps.get_current_user)):
    recording = _recording_or_404(recording_id, db, current_user)
    return FileResponse(path=recording.filepath, media_type=recording.mime_type or "application/octet-stream")
