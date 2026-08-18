import os
import secrets
import string
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core import deps
from app.core.audit import log_action
from app.core.config import settings as app_settings
from app.models.models import (
    JobStatus, Meeting, MeetingInvitation, MeetingStatus, Participant,
    ProcessingJob, Transcript, User, UserRole, meeting_participants,
)
from app.schemas.schemas import (
    InvitationCreate, InvitationJoin, MeetingCreate, MeetingOut, MeetingUpdate,
    ProcessingJobOut,
)
from app.services.email import email_service
from app.workers.tasks import run_background_job, transcribe_meeting

router = APIRouter()
INVITE_ALPHABET = string.ascii_uppercase + string.digits


def _invite_code(db: Session, length: int = 8) -> str:
    for _ in range(20):
        code = "".join(secrets.choice(INVITE_ALPHABET) for _ in range(length))
        if not db.query(MeetingInvitation).filter(MeetingInvitation.code == code).first():
            return code
    raise RuntimeError("Could not generate a unique meeting invitation code")


def _editable_meeting(meeting_id: int, db: Session, current_user: User) -> Meeting:
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if current_user.role != UserRole.admin and meeting.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorised to manage this meeting")
    return meeting


def _ensure_general_invitation(meeting: Meeting, db: Session) -> MeetingInvitation:
    invitation = (
        db.query(MeetingInvitation)
        .filter(MeetingInvitation.meeting_id == meeting.id, MeetingInvitation.email.is_(None))
        .order_by(MeetingInvitation.created_at.desc()).first()
    )
    if not invitation:
        invitation = MeetingInvitation(meeting_id=meeting.id, code=_invite_code(db), email=None)
        db.add(invitation)
        db.flush()
    return invitation


def _participant_by_email(db: Session, email: str) -> Optional[Participant]:
    return db.query(Participant).filter(func.lower(Participant.email) == email.strip().lower()).first()


def _link_participant(meeting: Meeting, participant: Participant, db: Session, attendance_status: str) -> None:
    existing = db.execute(
        meeting_participants.select().where(
            meeting_participants.c.meeting_id == meeting.id,
            meeting_participants.c.participant_id == participant.id,
        )
    ).mappings().first()
    if existing:
        if existing["attendance_status"] != "present" or attendance_status == "present":
            db.execute(
                meeting_participants.update().where(
                    meeting_participants.c.meeting_id == meeting.id,
                    meeting_participants.c.participant_id == participant.id,
                ).values(attendance_status=attendance_status)
            )
        return
    meeting.participants.append(participant)
    db.flush()
    db.execute(
        meeting_participants.update().where(
            meeting_participants.c.meeting_id == meeting.id,
            meeting_participants.c.participant_id == participant.id,
        ).values(attendance_status=attendance_status)
    )


# Register static routes before /{meeting_id}; otherwise values such as
# "directory" can be swallowed by the integer meeting-id route.
@router.get("/directory/staff-options")
def staff_attendance_options(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_minutes_editor),
):
    return [
        {"id": user.id, "name": user.full_name, "email": user.email, "access_role": user.role.value}
        for user in db.query(User).filter(User.is_active.is_(True)).order_by(User.full_name).all()
    ]


@router.get("/public/invitations/{code}")
def public_invitation(code: str, db: Session = Depends(deps.get_db)):
    invitation = db.query(MeetingInvitation).filter(MeetingInvitation.code == code.strip().upper()).first()
    if not invitation or not invitation.meeting or invitation.meeting.is_archived:
        raise HTTPException(status_code=404, detail="This meeting invitation is invalid or no longer available")
    meeting = invitation.meeting
    return {
        "code": invitation.code,
        "meeting_id": meeting.id,
        "meeting_title": meeting.title,
        "meeting_date": meeting.date,
        "description": meeting.description or "",
        "invited_email": invitation.email,
        "status": invitation.status,
        "school_name": app_settings.SCHOOL_NAME,
    }


@router.post("/public/invitations/{code}/join")
def join_by_invitation(code: str, body: InvitationJoin, db: Session = Depends(deps.get_db)):
    invitation = db.query(MeetingInvitation).filter(MeetingInvitation.code == code.strip().upper()).first()
    if not invitation or not invitation.meeting or invitation.meeting.is_archived:
        raise HTTPException(status_code=404, detail="This meeting invitation is invalid or no longer available")
    meeting = invitation.meeting
    email = invitation.email or (str(body.email).strip().lower() if body.email else None)
    participant = _participant_by_email(db, email) if email else None
    if not participant:
        participant = Participant(name=body.full_name.strip(), email=email, role_title=body.role_title.strip())
        db.add(participant)
        db.flush()
    else:
        participant.name = body.full_name.strip()
        participant.role_title = body.role_title.strip()
    _link_participant(meeting, participant, db, "present")
    invitation.status = "accepted"
    invitation.accepted_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(participant)
    return {
        "detail": "Attendance registered", "meeting_id": meeting.id,
        "meeting_title": meeting.title, "participant_id": participant.id,
        "name": participant.name, "email": participant.email,
        "role_title": participant.role_title,
    }


@router.post("/", response_model=MeetingOut, status_code=status.HTTP_201_CREATED)
def create_meeting(
    request: Request, meeting_in: MeetingCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_minutes_editor),
):
    meeting = Meeting(
        title=meeting_in.title, description=meeting_in.description, date=meeting_in.date,
        owner_id=current_user.id, status=MeetingStatus.draft, is_archived=False,
    )
    db.add(meeting)
    db.flush()
    for p_in in meeting_in.participants:
        if not p_in.name.strip():
            continue
        participant = _participant_by_email(db, p_in.email) if p_in.email else None
        if not participant:
            participant = Participant(
                name=p_in.name.strip(),
                email=p_in.email.strip().lower() if p_in.email else None,
                role_title=p_in.role_title,
            )
            db.add(participant)
            db.flush()
        _link_participant(meeting, participant, db, p_in.attendance_status)
    db.commit()
    db.refresh(meeting)
    log_action(db, action="create_meeting", details=f"User {current_user.email} created meeting: {meeting.title}", user_id=current_user.id, user_email=current_user.email, ip_address=request.client.host if request.client else None)
    return meeting


@router.get("/", response_model=List[MeetingOut])
def list_meetings(
    search: Optional[str] = None, status: Optional[str] = None, is_archived: bool = False,
    db: Session = Depends(deps.get_db), current_user: User = Depends(deps.get_current_user),
):
    query = db.query(Meeting).filter(Meeting.is_archived == is_archived)
    if current_user.role == UserRole.staff:
        query = query.filter(Meeting.status == MeetingStatus.completed)
    if status:
        query = query.filter(Meeting.status == status)
    if search:
        search_filter = f"%{search}%"
        query = query.outerjoin(Transcript).filter(
            Meeting.title.ilike(search_filter)
            | Meeting.description.ilike(search_filter)
            | Meeting.participants.any(Participant.name.ilike(search_filter))
            | Transcript.content.ilike(search_filter)
        )
    return query.order_by(Meeting.date.desc()).all()


@router.get("/{meeting_id}", response_model=MeetingOut)
def get_meeting(
    meeting_id: int, db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if current_user.role == UserRole.staff and meeting.status != MeetingStatus.completed:
        raise HTTPException(status_code=403, detail="Staff readers can access completed minutes only")
    return meeting


@router.put("/{meeting_id}", response_model=MeetingOut)
def update_meeting(
    meeting_id: int, request: Request, meeting_in: MeetingUpdate,
    db: Session = Depends(deps.get_db), current_user: User = Depends(deps.get_minutes_editor),
):
    meeting = _editable_meeting(meeting_id, db, current_user)
    for field in ("title", "description", "date", "is_archived", "status"):
        value = getattr(meeting_in, field)
        if value is not None:
            setattr(meeting, field, value)
    db.commit(); db.refresh(meeting)
    log_action(db, action="update_meeting", details=f"User updated meeting details for: {meeting.title}", user_id=current_user.id, user_email=current_user.email, ip_address=request.client.host if request.client else None)
    return meeting


@router.post("/{meeting_id}/invitations")
def create_invitations(
    meeting_id: int, body: InvitationCreate, request: Request,
    db: Session = Depends(deps.get_db), current_user: User = Depends(deps.get_minutes_editor),
):
    meeting = _editable_meeting(meeting_id, db, current_user)
    general = _ensure_general_invitation(meeting, db)
    general_link = f"{app_settings.PUBLIC_APP_URL}/join/{general.code}"
    results = []
    for email in sorted({str(email).strip().lower() for email in body.emails}):
        invitation = (
            db.query(MeetingInvitation)
            .filter(MeetingInvitation.meeting_id == meeting.id, func.lower(MeetingInvitation.email) == email)
            .order_by(MeetingInvitation.created_at.desc()).first()
        )
        if not invitation:
            invitation = MeetingInvitation(meeting_id=meeting.id, code=_invite_code(db), email=email)
            db.add(invitation); db.flush()
        participant = _participant_by_email(db, email)
        if not participant:
            display_name = email.split("@", 1)[0].replace(".", " ").replace("_", " ").title()
            participant = Participant(name=display_name, email=email, role_title="Invited")
            db.add(participant); db.flush()
        _link_participant(meeting, participant, db, "invited")
        invitation_link = f"{app_settings.PUBLIC_APP_URL}/join/{invitation.code}"
        sent = False; delivery_error = None
        if body.send_email:
            try:
                email_service.send_meeting_invitation(
                    recipient=email, meeting_title=meeting.title, meeting_date=meeting.date,
                    invitation_url=invitation_link, organization_name=app_settings.SCHOOL_NAME,
                )
                sent = True
            except Exception as exc:
                delivery_error = str(exc)
        results.append({"email": email, "link": invitation_link, "email_sent": sent, "delivery_error": delivery_error})
    db.commit()
    log_action(db, action="create_meeting_invitations", details=f"Created {len(results)} email invitation(s) for meeting {meeting.id}", user_id=current_user.id, user_email=current_user.email, ip_address=request.client.host if request.client else None)
    return {"meeting_id": meeting.id, "general_link": general_link, "smtp_configured": email_service.enabled, "invitations": results}


@router.delete("/{meeting_id}")
def delete_meeting(
    meeting_id: int, request: Request, permanent: bool = Query(default=False),
    db: Session = Depends(deps.get_db), current_user: User = Depends(deps.get_minutes_editor),
):
    meeting = _editable_meeting(meeting_id, db, current_user)
    title = meeting.title
    if permanent:
        recording_path = meeting.recording.filepath if meeting.recording else None
        db.delete(meeting); db.commit()
        if recording_path:
            try: os.remove(recording_path)
            except FileNotFoundError: pass
        (Path(app_settings.EXPORT_DIR) / f"meeting-{meeting_id}-final-minutes.pdf").unlink(missing_ok=True)
    else:
        meeting.is_archived = True; db.commit(); db.refresh(meeting)
    log_action(db, action="delete_meeting" if permanent else "archive_meeting", details=f"User {'permanently deleted' if permanent else 'archived'} meeting: {title}", user_id=current_user.id, user_email=current_user.email, ip_address=request.client.host if request.client else None)
    return {"detail": "Meeting permanently deleted"} if permanent else meeting


@router.post("/{meeting_id}/transcribe", response_model=ProcessingJobOut)
def trigger_transcription(
    meeting_id: int, request: Request, db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_minutes_editor),
):
    meeting = _editable_meeting(meeting_id, db, current_user)
    if not meeting.recording:
        raise HTTPException(status_code=400, detail="Cannot transcribe meeting: no recording is attached")
    active_job = (
        db.query(ProcessingJob)
        .filter(ProcessingJob.meeting_id == meeting_id, ProcessingJob.status.in_([JobStatus.queued, JobStatus.converting, JobStatus.transcribing, JobStatus.summarising]))
        .order_by(ProcessingJob.created_at.desc()).first()
    )
    if active_job:
        return active_job
    job = ProcessingJob(id=str(uuid.uuid4()), meeting_id=meeting_id, status=JobStatus.queued, progress=0)
    db.add(job); meeting.status = MeetingStatus.processing; db.commit(); db.refresh(job)
    run_background_job(transcribe_meeting, meeting_id, job.id)
    log_action(db, action="trigger_transcription", details=f"Triggered transcription job {job.id} for meeting {meeting.title}", user_id=current_user.id, user_email=current_user.email, ip_address=request.client.host if request.client else None)
    return job


@router.get("/{meeting_id}/status", response_model=ProcessingJobOut)
def get_job_status(meeting_id: int, db: Session = Depends(deps.get_db), current_user: User = Depends(deps.get_current_user)):
    job = db.query(ProcessingJob).filter(ProcessingJob.meeting_id == meeting_id).order_by(ProcessingJob.created_at.desc()).first()
    if not job:
        raise HTTPException(status_code=404, detail="No transcription job found for this meeting")
    return job


@router.get("/{meeting_id}/attendance")
def get_attendance(meeting_id: int, db: Session = Depends(deps.get_db), current_user: User = Depends(deps.get_current_user)):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting: raise HTTPException(status_code=404, detail="Meeting not found")
    rows = db.execute(meeting_participants.select().where(meeting_participants.c.meeting_id == meeting_id)).mappings().all()
    statuses = {row["participant_id"]: row["attendance_status"] for row in rows}
    return [{"id": p.id, "name": p.name, "email": p.email, "role_title": p.role_title, "attendance_status": statuses.get(p.id, "present")} for p in meeting.participants]


@router.put("/{meeting_id}/attendance/{participant_id}")
def update_attendance(
    meeting_id: int, participant_id: int, body: dict, db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_minutes_editor),
):
    _editable_meeting(meeting_id, db, current_user)
    attendance_status = body.get("attendance_status")
    if attendance_status not in {"present", "absent", "apology", "invited"}:
        raise HTTPException(status_code=400, detail="Invalid attendance status")
    result = db.execute(meeting_participants.update().where(meeting_participants.c.meeting_id == meeting_id, meeting_participants.c.participant_id == participant_id).values(attendance_status=attendance_status))
    if result.rowcount == 0: raise HTTPException(status_code=404, detail="Attendance record not found")
    db.commit(); return {"detail": "Attendance updated", "attendance_status": attendance_status}


@router.post("/{meeting_id}/retry", response_model=ProcessingJobOut)
def retry_transcription(
    meeting_id: int, request: Request, db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_minutes_editor),
):
    meeting = _editable_meeting(meeting_id, db, current_user)
    if meeting.status != MeetingStatus.failed: raise HTTPException(status_code=400, detail="Cannot retry a job that has not failed")
    if not meeting.recording: raise HTTPException(status_code=400, detail="Cannot retry: recording is missing")
    job = ProcessingJob(id=str(uuid.uuid4()), meeting_id=meeting_id, status=JobStatus.queued, progress=0)
    db.add(job); meeting.status = MeetingStatus.processing; db.commit(); db.refresh(job)
    run_background_job(transcribe_meeting, meeting_id, job.id)
    log_action(db, action="retry_transcription", details=f"Retried failed transcription job. New job ID: {job.id}", user_id=current_user.id, user_email=current_user.email, ip_address=request.client.host if request.client else None)
    return job
