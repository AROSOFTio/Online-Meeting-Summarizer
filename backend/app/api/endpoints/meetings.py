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
from app.models.meeting_flow import DirectoryProfile, MeetingRuntime
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


def _runtime_for(meeting: Meeting, db: Session) -> MeetingRuntime:
    runtime = db.query(MeetingRuntime).filter(MeetingRuntime.meeting_id == meeting.id).first()
    if runtime:
        return runtime
    lifecycle = "ended" if meeting.status in {MeetingStatus.processing, MeetingStatus.completed, MeetingStatus.failed} else "scheduled"
    runtime = MeetingRuntime(meeting_id=meeting.id, lifecycle=lifecycle)
    db.add(runtime)
    db.flush()
    return runtime


def _profile_for(db: Session, user: User) -> DirectoryProfile:
    profile = db.query(DirectoryProfile).filter(DirectoryProfile.user_id == user.id).first()
    if not profile:
        profile = DirectoryProfile(user_id=user.id, directory_group="Staff")
        db.add(profile)
        db.flush()
    return profile


def _ensure_general_invitation(meeting: Meeting, db: Session) -> MeetingInvitation:
    invitation = (
        db.query(MeetingInvitation)
        .filter(MeetingInvitation.meeting_id == meeting.id, MeetingInvitation.email.is_(None))
        .order_by(MeetingInvitation.created_at.desc()).first()
    )
    if not invitation:
        invitation = MeetingInvitation(meeting_id=meeting.id, code=_invite_code(db), email=None, status="sent")
        db.add(invitation)
        db.flush()
    return invitation


def _participant_by_email(db: Session, email: str) -> Optional[Participant]:
    return db.query(Participant).filter(func.lower(Participant.email) == email.strip().lower()).first()


def _participant_by_name_for_meeting(db: Session, meeting: Meeting, name: str) -> Optional[Participant]:
    normalized = name.strip().lower()
    return next((participant for participant in meeting.participants if participant.name.strip().lower() == normalized), None)


def _link_participant(meeting: Meeting, participant: Participant, db: Session, attendance_status: str) -> None:
    existing = db.execute(
        meeting_participants.select().where(
            meeting_participants.c.meeting_id == meeting.id,
            meeting_participants.c.participant_id == participant.id,
        )
    ).mappings().first()
    if existing:
        current = existing["attendance_status"]
        if current == "present" and attendance_status != "present":
            return
        if current == "waiting" and attendance_status == "invited":
            return
        if current != attendance_status:
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


def _user_by_email(db: Session, email: Optional[str]) -> Optional[User]:
    if not email:
        return None
    return db.query(User).filter(func.lower(User.email) == email.strip().lower(), User.is_active.is_(True)).first()


# Register static routes before /{meeting_id}; otherwise values such as
# "directory" can be swallowed by the integer meeting-id route.
@router.get("/directory/staff-options")
def staff_attendance_options(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_minutes_editor),
):
    options = []
    users = db.query(User).filter(User.is_active.is_(True)).order_by(User.full_name).all()
    for user in users:
        profile = _profile_for(db, user)
        options.append({
            "id": user.id,
            "name": user.full_name,
            "email": user.email,
            "access_role": user.role.value,
            "directory_group": profile.directory_group or "Staff",
            "position_title": profile.position_title,
        })
    return options


@router.get("/public/invitations/{code}")
def public_invitation(code: str, db: Session = Depends(deps.get_db)):
    invitation = db.query(MeetingInvitation).filter(MeetingInvitation.code == code.strip().upper()).first()
    if not invitation or not invitation.meeting or invitation.meeting.is_archived:
        raise HTTPException(status_code=404, detail="This meeting invitation is invalid or no longer available")
    meeting = invitation.meeting
    runtime = _runtime_for(meeting, db)
    known_user = _user_by_email(db, invitation.email)
    known_name = None
    known_position = None
    known_group = None
    if known_user:
        profile = _profile_for(db, known_user)
        known_name = known_user.full_name
        known_position = profile.position_title
        known_group = profile.directory_group
    db.commit()
    return {
        "code": invitation.code,
        "meeting_id": meeting.id,
        "meeting_title": meeting.title,
        "meeting_date": meeting.date,
        "description": meeting.description or "",
        "invited_email": invitation.email,
        "invitation_status": invitation.status,
        "lifecycle": runtime.lifecycle,
        "started_at": runtime.started_at,
        "ended_at": runtime.ended_at,
        "requires_name": known_user is None,
        "known_name": known_name,
        "known_position": known_position,
        "known_group": known_group,
        "school_name": app_settings.SCHOOL_NAME,
    }


@router.post("/public/invitations/{code}/join")
def join_by_invitation(code: str, body: InvitationJoin, db: Session = Depends(deps.get_db)):
    invitation = db.query(MeetingInvitation).filter(MeetingInvitation.code == code.strip().upper()).first()
    if not invitation or not invitation.meeting or invitation.meeting.is_archived:
        raise HTTPException(status_code=404, detail="This meeting invitation is invalid or no longer available")
    meeting = invitation.meeting
    runtime = _runtime_for(meeting, db)
    if runtime.lifecycle == "ended" or meeting.status in {MeetingStatus.processing, MeetingStatus.completed, MeetingStatus.failed}:
        raise HTTPException(status_code=409, detail="This meeting has already ended")

    known_user = _user_by_email(db, invitation.email)
    email = invitation.email.strip().lower() if invitation.email else None
    if known_user:
        profile = _profile_for(db, known_user)
        full_name = known_user.full_name.strip()
        role_title = (profile.position_title or profile.directory_group or "Staff").strip()
    else:
        full_name = (body.full_name or "").strip()
        if len(full_name) < 2:
            raise HTTPException(status_code=400, detail="Please enter your full name")
        existing_with_email = _participant_by_email(db, email) if email else None
        role_title = (existing_with_email.role_title if existing_with_email else None) or "Guest"

    participant = _participant_by_email(db, email) if email else _participant_by_name_for_meeting(db, meeting, full_name)
    if not participant:
        participant = Participant(name=full_name, email=email, role_title=role_title)
        db.add(participant)
        db.flush()
    else:
        if known_user:
            participant.name = full_name
            participant.role_title = role_title
        elif not participant.name.strip():
            participant.name = full_name

    attendance_status = "present" if runtime.lifecycle == "live" else "waiting"
    _link_participant(meeting, participant, db, attendance_status)
    invitation.status = "joined" if attendance_status == "present" else "waiting"
    db.commit()
    db.refresh(participant)
    return {
        "detail": "Attendance registered",
        "meeting_id": meeting.id,
        "meeting_title": meeting.title,
        "participant_id": participant.id,
        "name": participant.name,
        "email": participant.email,
        "role_title": participant.role_title,
        "attendance_status": attendance_status,
        "lifecycle": runtime.lifecycle,
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
    db.add(MeetingRuntime(meeting_id=meeting.id, lifecycle="scheduled"))
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


@router.get("/{meeting_id}/runtime")
def get_meeting_runtime(
    meeting_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    runtime = _runtime_for(meeting, db)
    db.commit()
    return {"meeting_id": meeting.id, "lifecycle": runtime.lifecycle, "started_at": runtime.started_at, "ended_at": runtime.ended_at}


@router.post("/{meeting_id}/start")
def start_meeting(
    meeting_id: int,
    request: Request,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_minutes_editor),
):
    meeting = _editable_meeting(meeting_id, db, current_user)
    if meeting.status in {MeetingStatus.processing, MeetingStatus.completed, MeetingStatus.failed}:
        raise HTTPException(status_code=400, detail="This meeting cannot be started in its current state")
    runtime = _runtime_for(meeting, db)
    if runtime.lifecycle == "ended":
        raise HTTPException(status_code=400, detail="This meeting has already ended")
    if runtime.lifecycle != "live":
        runtime.lifecycle = "live"
        runtime.started_at = datetime.now(timezone.utc)
        runtime.ended_at = None
        db.commit()
        log_action(db, action="start_meeting", details=f"Started meeting: {meeting.title}", user_id=current_user.id, user_email=current_user.email, ip_address=request.client.host if request.client else None)
    return {"meeting_id": meeting.id, "lifecycle": runtime.lifecycle, "started_at": runtime.started_at}


@router.post("/{meeting_id}/end")
def end_meeting(
    meeting_id: int,
    request: Request,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_minutes_editor),
):
    meeting = _editable_meeting(meeting_id, db, current_user)
    runtime = _runtime_for(meeting, db)
    if runtime.lifecycle != "ended":
        runtime.lifecycle = "ended"
        runtime.ended_at = datetime.now(timezone.utc)
        db.execute(
            meeting_participants.update().where(
                meeting_participants.c.meeting_id == meeting.id,
                meeting_participants.c.attendance_status == "waiting",
            ).values(attendance_status="absent")
        )
        db.commit()
        log_action(db, action="end_meeting", details=f"Ended meeting: {meeting.title}", user_id=current_user.id, user_email=current_user.email, ip_address=request.client.host if request.client else None)
    return {"meeting_id": meeting.id, "lifecycle": runtime.lifecycle, "ended_at": runtime.ended_at}


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
    recipients: dict[str, Optional[User]] = {}

    if body.user_ids:
        users = db.query(User).filter(User.id.in_(set(body.user_ids)), User.is_active.is_(True)).all()
        for user in users:
            recipients[user.email.strip().lower()] = user

    for email_value in body.emails:
        email = str(email_value).strip().lower()
        if email and email not in recipients:
            recipients[email] = _user_by_email(db, email)

    for email in sorted(recipients):
        known_user = recipients[email]
        invitation = (
            db.query(MeetingInvitation)
            .filter(MeetingInvitation.meeting_id == meeting.id, func.lower(MeetingInvitation.email) == email)
            .order_by(MeetingInvitation.created_at.desc()).first()
        )
        if not invitation:
            invitation = MeetingInvitation(meeting_id=meeting.id, code=_invite_code(db), email=email, status="sent")
            db.add(invitation); db.flush()
        elif invitation.status == "pending":
            invitation.status = "sent"

        display_name = None
        if known_user:
            profile = _profile_for(db, known_user)
            display_name = known_user.full_name
            participant = _participant_by_email(db, email)
            if not participant:
                participant = Participant(
                    name=known_user.full_name,
                    email=email,
                    role_title=profile.position_title or profile.directory_group or "Staff",
                )
                db.add(participant); db.flush()
            else:
                participant.name = known_user.full_name
                participant.role_title = profile.position_title or profile.directory_group or participant.role_title
            _link_participant(meeting, participant, db, "invited")
        else:
            participant = _participant_by_email(db, email)
            if participant:
                display_name = participant.name
                _link_participant(meeting, participant, db, "invited")

        invitation_link = f"{app_settings.PUBLIC_APP_URL}/join/{invitation.code}"
        sent = False; delivery_error = None
        if body.send_email:
            try:
                email_service.send_meeting_invitation(
                    recipient=email,
                    meeting_title=meeting.title,
                    meeting_date=meeting.date,
                    invitation_url=invitation_link,
                    organization_name=app_settings.SCHOOL_NAME,
                )
                sent = True
            except Exception as exc:
                delivery_error = str(exc)
        results.append({
            "email": email,
            "name": display_name,
            "user_id": known_user.id if known_user else None,
            "link": invitation_link,
            "email_sent": sent,
            "delivery_error": delivery_error,
        })
    db.commit()
    log_action(db, action="create_meeting_invitations", details=f"Created {len(results)} personal invitation(s) for meeting {meeting.id}", user_id=current_user.id, user_email=current_user.email, ip_address=request.client.host if request.client else None)
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
    db.add(job); meeting.status = MeetingStatus.processing
    runtime = _runtime_for(meeting, db)
    if runtime.lifecycle != "ended":
        runtime.lifecycle = "ended"
        runtime.ended_at = datetime.now(timezone.utc)
    db.commit(); db.refresh(job)
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
    if attendance_status not in {"present", "absent", "apology", "invited", "waiting"}:
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
