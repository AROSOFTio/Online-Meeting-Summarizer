from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.endpoints import meetings as meetings_endpoint
from app.core import deps
from app.models.models import Meeting, MeetingInvitation, Participant, User, meeting_participants
from app.schemas.schemas import InvitationCreate, InvitationJoin

router = APIRouter()
VALID_STATUSES = {"present", "absent", "apology", "invited", "waiting"}


def _encode_status(status: str, reason: str | None = None) -> str:
    status = (status or "invited").strip().lower()
    if status not in VALID_STATUSES:
        status = "invited"
    clean_reason = " ".join((reason or "").split()).strip()[:180]
    if clean_reason and status in {"absent", "apology"}:
        return f"{status} — {clean_reason}"
    return status


def _decode_status(value: str | None) -> tuple[str, str]:
    raw = (value or "invited").strip()
    lowered = raw.lower()
    for status in ("present", "absent", "apology", "invited", "waiting"):
        if lowered == status:
            return status, ""
        if lowered.startswith(status):
            reason = raw[len(status):].lstrip(" —:-|\t")
            return status, reason
    return "invited", ""


def _attendance_row(db: Session, meeting_id: int, participant_id: int):
    return db.execute(
        meeting_participants.select().where(
            meeting_participants.c.meeting_id == meeting_id,
            meeting_participants.c.participant_id == participant_id,
        )
    ).mappings().first()


@router.post("/{meeting_id}/invitations")
def create_invitations_with_full_register(
    meeting_id: int,
    body: InvitationCreate,
    request: Request,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_minutes_editor),
):
    """Use the normal invitation flow, then guarantee every emailed invitee is in the register."""
    before = db.execute(
        meeting_participants.select().where(meeting_participants.c.meeting_id == meeting_id)
    ).mappings().all()
    protected = {
        row["participant_id"]: row["attendance_status"]
        for row in before
        if str(row["attendance_status"] or "").lower().startswith("apology")
    }

    result = meetings_endpoint.create_invitations(meeting_id, body, request, db, current_user)
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    for email_value in body.emails:
        email = str(email_value).strip().lower()
        participant = db.query(Participant).filter(func.lower(Participant.email) == email).first()
        if not participant:
            participant = Participant(name=email, email=email, role_title="Invited guest")
            db.add(participant)
            db.flush()
        meetings_endpoint._link_participant(meeting, participant, db, "invited")

    for participant_id, previous_status in protected.items():
        db.execute(
            meeting_participants.update().where(
                meeting_participants.c.meeting_id == meeting_id,
                meeting_participants.c.participant_id == participant_id,
            ).values(attendance_status=previous_status)
        )
    db.commit()
    return result


@router.post("/public/invitations/{code}/apology")
def submit_apology(code: str, body: dict, db: Session = Depends(deps.get_db)):
    """Allow an invitee to decline attendance and give an apology/reason from the same link."""
    reason = " ".join(str(body.get("reason") or "").split()).strip()
    if len(reason) < 2:
        raise HTTPException(status_code=400, detail="Please give a short reason for being absent")
    full_name = str(body.get("full_name") or "").strip() or None

    invitation = db.query(MeetingInvitation).filter(MeetingInvitation.code == code.strip().upper()).first()
    if not invitation or not invitation.meeting or invitation.meeting.is_archived:
        raise HTTPException(status_code=404, detail="This meeting invitation is invalid or no longer available")

    # Reuse the normal identity/participant registration path, then mark the
    # person as an apology instead of sending them into the live room.
    joined = meetings_endpoint.join_by_invitation(
        code,
        InvitationJoin(full_name=full_name),
        db,
    )
    participant_id = int(joined["participant_id"])
    db.execute(
        meeting_participants.update().where(
            meeting_participants.c.meeting_id == invitation.meeting_id,
            meeting_participants.c.participant_id == participant_id,
        ).values(attendance_status=_encode_status("apology", reason))
    )
    invitation.status = "apology"
    db.commit()
    return {
        "detail": "Your apology has been recorded",
        "meeting_id": invitation.meeting_id,
        "participant_id": participant_id,
        "attendance_status": "apology",
        "attendance_reason": reason[:180],
    }


@router.get("/{meeting_id}/attendance")
def get_attendance_register(
    meeting_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    rows = db.execute(
        meeting_participants.select().where(meeting_participants.c.meeting_id == meeting_id)
    ).mappings().all()
    statuses = {row["participant_id"]: row["attendance_status"] for row in rows}
    output = []
    for participant in meeting.participants:
        status, reason = _decode_status(statuses.get(participant.id, "invited"))
        output.append({
            "id": participant.id,
            "name": participant.name,
            "email": participant.email,
            "role_title": participant.role_title,
            "attendance_status": status,
            "attendance_reason": reason,
        })
    return output


@router.put("/{meeting_id}/attendance/{participant_id}")
def update_attendance_register(
    meeting_id: int,
    participant_id: int,
    body: dict,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_minutes_editor),
):
    meetings_endpoint._editable_meeting(meeting_id, db, current_user)
    status = str(body.get("attendance_status") or "").strip().lower()
    if status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid attendance status")

    current = _attendance_row(db, meeting_id, participant_id)
    if not current:
        raise HTTPException(status_code=404, detail="Attendance record not found")
    current_status, current_reason = _decode_status(current["attendance_status"])
    reason_value = body.get("attendance_reason", body.get("reason"))
    reason = current_reason if reason_value is None and current_status == status else str(reason_value or "").strip()

    db.execute(
        meeting_participants.update().where(
            meeting_participants.c.meeting_id == meeting_id,
            meeting_participants.c.participant_id == participant_id,
        ).values(attendance_status=_encode_status(status, reason))
    )
    db.commit()
    return {
        "detail": "Attendance updated",
        "attendance_status": status,
        "attendance_reason": reason[:180] if status in {"absent", "apology"} else "",
    }
