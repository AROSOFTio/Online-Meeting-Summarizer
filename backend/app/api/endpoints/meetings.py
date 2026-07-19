import os
import uuid
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core import deps
from app.core.audit import log_action
from app.models.models import Meeting, Participant, MeetingStatus, ProcessingJob, JobStatus, User, UserRole, Transcript
from app.schemas.schemas import MeetingCreate, MeetingOut, MeetingUpdate, ProcessingJobOut
from app.workers.tasks import transcribe_meeting, run_background_job
from app.core.config import settings as app_settings

router = APIRouter()

@router.post("/", response_model=MeetingOut, status_code=status.HTTP_201_CREATED)
def create_meeting(
    request: Request,
    meeting_in: MeetingCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Create a new meeting and associate participants."""
    meeting = Meeting(
        title=meeting_in.title,
        description=meeting_in.description,
        date=meeting_in.date,
        owner_id=current_user.id,
        status=MeetingStatus.draft,
        is_archived=False
    )
    db.add(meeting)
    db.commit()
    db.refresh(meeting)

    for p_in in meeting_in.participants:
        participant = None
        if p_in.email:
            participant = db.query(Participant).filter(Participant.email == p_in.email).first()
        if not participant:
            participant = Participant(
                name=p_in.name,
                email=p_in.email,
                role_title=p_in.role_title
            )
            db.add(participant)
            db.commit()
            db.refresh(participant)
        
        # Link meeting and participant
        meeting.participants.append(participant)
    
    db.commit()
    db.refresh(meeting)

    log_action(
        db,
        action="create_meeting",
        details=f"User {current_user.email} created meeting: {meeting.title}",
        user_id=current_user.id,
        user_email=current_user.email,
        ip_address=request.client.host if request.client else None
    )
    
    return meeting

@router.get("/", response_model=List[MeetingOut])
def list_meetings(
    search: Optional[str] = None,
    status: Optional[str] = None,
    is_archived: bool = False,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Retrieve list of meetings with permission guards, full-text search, and status filters."""
    query = db.query(Meeting).filter(Meeting.is_archived == is_archived)

    # Permission check: Non-admins only see meetings they own or participate in
    if current_user.role != UserRole.admin:
        query = query.filter(
            (Meeting.owner_id == current_user.id) |
            (Meeting.participants.any(Participant.email == current_user.email))
        )

    if status:
        query = query.filter(Meeting.status == status)

    if search:
        search_filter = f"%{search}%"
        query = query.outerjoin(Transcript).filter(
            Meeting.title.ilike(search_filter) |
            Meeting.description.ilike(search_filter) |
            Meeting.participants.any(Participant.name.ilike(search_filter)) |
            Transcript.content.ilike(search_filter)
        )

    return query.order_by(Meeting.date.desc()).all()

@router.get("/{meeting_id}", response_model=MeetingOut)
def get_meeting(
    meeting_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Fetch details of a single meeting (with authorization checks)."""
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    # Authorisation check
    if current_user.role != UserRole.admin and meeting.owner_id != current_user.id:
        participant_emails = [p.email for p in meeting.participants if p.email]
        if current_user.email not in participant_emails:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to view this meeting"
            )

    return meeting

@router.put("/{meeting_id}", response_model=MeetingOut)
def update_meeting(
    meeting_id: int,
    request: Request,
    meeting_in: MeetingUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Update meeting details."""
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    # Authorisation check (Only owner or admin can edit details)
    if current_user.role != UserRole.admin and meeting.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorised to edit this meeting")

    if meeting_in.title is not None:
        meeting.title = meeting_in.title
    if meeting_in.description is not None:
        meeting.description = meeting_in.description
    if meeting_in.date is not None:
        meeting.date = meeting_in.date
    if meeting_in.is_archived is not None:
        meeting.is_archived = meeting_in.is_archived
    if meeting_in.status is not None:
        meeting.status = meeting_in.status

    db.commit()
    db.refresh(meeting)

    log_action(
        db,
        action="update_meeting",
        details=f"User updated meeting details for: {meeting.title}",
        user_id=current_user.id,
        user_email=current_user.email,
        ip_address=request.client.host if request.client else None
    )

    return meeting

@router.delete("/{meeting_id}")
def delete_meeting(
    meeting_id: int,
    request: Request,
    permanent: bool = Query(default=False),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Archive a meeting, or permanently delete it and all related minutes."""
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    # Authorisation check
    if current_user.role != UserRole.admin and meeting.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorised to delete this meeting")

    title = meeting.title
    if permanent:
        recording_path = meeting.recording.filepath if meeting.recording else None
        db.delete(meeting)
        db.commit()
        if recording_path:
            try:
                os.remove(recording_path)
            except FileNotFoundError:
                pass
        final_minutes = Path(app_settings.EXPORT_DIR) / f"meeting-{meeting_id}-final-minutes.pdf"
        final_minutes.unlink(missing_ok=True)
    else:
        meeting.is_archived = True
        db.commit()
        db.refresh(meeting)

    log_action(
        db,
        action="delete_meeting" if permanent else "archive_meeting",
        details=f"User {'permanently deleted' if permanent else 'archived'} meeting: {title}",
        user_id=current_user.id,
        user_email=current_user.email,
        ip_address=request.client.host if request.client else None
    )

    return {"detail": "Meeting permanently deleted"} if permanent else meeting

@router.post("/{meeting_id}/transcribe", response_model=ProcessingJobOut)
def trigger_transcription(
    meeting_id: int,
    request: Request,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Queue a background task to process and transcribe the meeting recording."""
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    # Check for existing recording
    if not meeting.recording:
        raise HTTPException(
            status_code=400,
            detail="Cannot transcribe meeting: No audio recording associated with this meeting"
        )

    # Generate a unique job ID
    job_id = str(uuid.uuid4())
    job = ProcessingJob(
        id=job_id,
        meeting_id=meeting_id,
        status=JobStatus.queued,
        progress=0
    )
    db.add(job)
    
    # Update meeting status to processing
    meeting.status = MeetingStatus.processing
    db.commit()
    db.refresh(job)

    # Dispatch Celery or local thread executor task
    run_background_job(transcribe_meeting, meeting_id, job_id)

    log_action(
        db,
        action="trigger_transcription",
        details=f"Triggered transcription job {job_id} for meeting {meeting.title}",
        user_id=current_user.id,
        user_email=current_user.email,
        ip_address=request.client.host if request.client else None
    )

    return job

@router.get("/{meeting_id}/status", response_model=ProcessingJobOut)
def get_job_status(
    meeting_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Retrieve the progress and status of the current meeting transcription job."""
    job = db.query(ProcessingJob).filter(ProcessingJob.meeting_id == meeting_id).order_by(ProcessingJob.created_at.desc()).first()
    if not job:
        raise HTTPException(status_code=404, detail="No transcription job found for this meeting")
    return job

@router.post("/{meeting_id}/retry", response_model=ProcessingJobOut)
def retry_transcription(
    meeting_id: int,
    request: Request,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Retry transcription of a failed job without duplicating meeting records."""
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    if meeting.status != MeetingStatus.failed:
        raise HTTPException(status_code=400, detail="Cannot retry a job that has not failed")

    # Generate a new job ID
    job_id = str(uuid.uuid4())
    job = ProcessingJob(
        id=job_id,
        meeting_id=meeting_id,
        status=JobStatus.queued,
        progress=0
    )
    db.add(job)
    
    meeting.status = MeetingStatus.processing
    db.commit()
    db.refresh(job)

    # Dispatch
    run_background_job(transcribe_meeting, meeting_id, job_id)

    log_action(
        db,
        action="retry_transcription",
        details=f"Retried failed transcription job. New job ID: {job_id}",
        user_id=current_user.id,
        user_email=current_user.email,
        ip_address=request.client.host if request.client else None
    )

    return job
