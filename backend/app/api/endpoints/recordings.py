import os
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pathlib import Path

from app.core import deps
from app.core.config import settings
from app.core.audit import log_action
from app.models.models import Meeting, Recording, User, UserRole, Participant
from app.services.audio import validate_media_file

router = APIRouter()

@router.post("/upload/{meeting_id}")
async def upload_recording(
    meeting_id: int,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_minutes_editor)
):
    """
    Streamed upload of audio recordings.
    Validates MIME type, extension, and file size before saving.
    """
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    # Authorisation check
    if current_user.role != UserRole.admin and meeting.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to upload files for this meeting"
        )

    # We read file size from Content-Length or seek
    file.file.seek(0, os.SEEK_END)
    file_size = file.file.tell()
    file.file.seek(0) # Reset pointer

    # Run validation
    is_valid, err_msg = validate_media_file(file.filename or "", file_size, file.content_type)
    if not is_valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err_msg)

    # Ensure upload directory exists
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

    # Assemble unique filepath
    file_ext = Path(file.filename or "").suffix.lower()
    saved_filename = f"raw_{meeting_id}_{uuid_str()}{file_ext}"
    saved_filepath = os.path.join(settings.UPLOAD_DIR, saved_filename)

    # Secure streamed save to disk to prevent memory bloating
    try:
        with open(saved_filepath, "wb") as buffer:
            # Read in 1MB chunks
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                buffer.write(chunk)
    except Exception as e:
        if os.path.exists(saved_filepath):
            os.remove(saved_filepath)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to write recording to disk: {str(e)}"
        )

    # Remove existing recording if replacing
    existing_rec = db.query(Recording).filter(Recording.meeting_id == meeting_id).first()
    if existing_rec:
        if os.path.exists(existing_rec.filepath):
            try:
                os.remove(existing_rec.filepath)
            except Exception:
                pass
        db.delete(existing_rec)
        db.commit()

    # Save to database
    recording = Recording(
        meeting_id=meeting_id,
        filename=file.filename or "recording",
        filepath=saved_filepath,
        file_size_bytes=file_size,
        mime_type=file.content_type,
        uploaded_by_id=current_user.id
    )
    db.add(recording)
    db.commit()
    db.refresh(recording)

    log_action(
        db,
        action="upload_recording",
        details=f"Uploaded recording file {recording.filename} for meeting ID {meeting_id}",
        user_id=current_user.id,
        user_email=current_user.email,
        ip_address=request.client.host if request.client else None
    )

    return {
        "id": recording.id,
        "meeting_id": recording.meeting_id,
        "filename": recording.filename,
        "file_size_bytes": recording.file_size_bytes,
        "mime_type": recording.mime_type
    }

@router.get("/{recording_id}/download")
def download_recording(
    recording_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Secure direct file download endpoint verifying user permissions."""
    recording = db.query(Recording).filter(Recording.id == recording_id).first()
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    meeting = recording.meeting
    # Authorisation check
    if current_user.role != UserRole.admin and meeting.owner_id != current_user.id:
        participant_emails = [p.email for p in meeting.participants if p.email]
        if current_user.email not in participant_emails:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not authorised to download this file"
            )

    if not os.path.exists(recording.filepath):
        raise HTTPException(status_code=404, detail="Physical audio file missing on storage disk")

    return FileResponse(
        path=recording.filepath,
        media_type=recording.mime_type,
        filename=recording.filename
    )

@router.get("/{recording_id}/play")
def play_recording(
    recording_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Streaming audio playback endpoint verifying user permissions."""
    recording = db.query(Recording).filter(Recording.id == recording_id).first()
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    meeting = recording.meeting
    # Authorisation check
    if current_user.role != UserRole.admin and meeting.owner_id != current_user.id:
        participant_emails = [p.email for p in meeting.participants if p.email]
        if current_user.email not in participant_emails:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not authorised to stream this file"
            )

    if not os.path.exists(recording.filepath):
        raise HTTPException(status_code=404, detail="Physical audio file missing on storage disk")

    return FileResponse(
        path=recording.filepath,
        media_type=recording.mime_type
    )

def uuid_str() -> str:
    import uuid
    return str(uuid.uuid4())[:8]
