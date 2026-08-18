import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core import deps
from app.core.audit import log_action
from app.core.config import settings
from app.models.models import Meeting, MeetingStatus, Recording, User, UserRole
from app.services.audio import validate_media_file

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
async def upload_recording(
    meeting_id: int,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_minutes_editor),
):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if current_user.role != UserRole.admin and meeting.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="You do not have permission to upload files for this meeting")

    file.file.seek(0, os.SEEK_END)
    file_size = file.file.tell()
    file.file.seek(0)
    valid, error = validate_media_file(file.filename or "", file_size, file.content_type)
    if not valid:
        raise HTTPException(status_code=400, detail=error)

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    extension = Path(file.filename or "").suffix.lower()
    saved_path = os.path.join(settings.UPLOAD_DIR, f"raw_{meeting_id}_{str(uuid.uuid4())[:8]}{extension}")
    try:
        with open(saved_path, "wb") as output:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                output.write(chunk)
    except Exception as exc:
        if os.path.exists(saved_path):
            os.remove(saved_path)
        raise HTTPException(status_code=500, detail=f"Failed to write recording: {exc}") from exc

    existing = db.query(Recording).filter(Recording.meeting_id == meeting_id).first()
    old_path = existing.filepath if existing else None
    if existing:
        db.delete(existing)
        db.flush()
    recording = Recording(
        meeting_id=meeting_id,
        filename=file.filename or "recording",
        filepath=saved_path,
        file_size_bytes=file_size,
        mime_type=file.content_type,
        uploaded_by_id=current_user.id,
    )
    db.add(recording)
    meeting.status = MeetingStatus.draft
    db.commit()
    db.refresh(recording)
    if old_path and old_path != saved_path and os.path.exists(old_path):
        try:
            os.remove(old_path)
        except OSError:
            pass
    log_action(db, action="upload_recording", details=f"Uploaded {recording.filename} for meeting {meeting_id}", user_id=current_user.id, user_email=current_user.email, ip_address=request.client.host if request.client else None)
    return {"id": recording.id, "meeting_id": recording.meeting_id, "filename": recording.filename, "file_size_bytes": recording.file_size_bytes, "mime_type": recording.mime_type}


def _recording_or_404(recording_id: int, db: Session, user: User) -> Recording:
    recording = db.query(Recording).filter(Recording.id == recording_id).first()
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")
    if not _can_read(recording.meeting, user):
        raise HTTPException(status_code=403, detail="You are not authorised to access this recording")
    if not os.path.exists(recording.filepath):
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
