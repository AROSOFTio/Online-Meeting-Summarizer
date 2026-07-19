from pathlib import Path
import re

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from app.core import deps
from app.models.models import Meeting, Transcript, Summary, Decision, ActionItem, User, UserRole, SystemSetting, meeting_participants
from app.services.export import export_pdf, export_docx, export_txt
from app.services.email import email_service
from app.core.config import settings as app_settings
from app.core.audit import log_action

router = APIRouter()


def _final_pdf_path(meeting_id: int) -> Path:
    return Path(app_settings.EXPORT_DIR) / f"meeting-{meeting_id}-final-minutes.pdf"


def _gather_export_data(meeting_id: int, db: Session):
    """Collect all data needed for export from the database."""
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    transcript = db.query(Transcript).filter(Transcript.meeting_id == meeting_id).first()
    summary = db.query(Summary).filter(Summary.meeting_id == meeting_id).first()
    decisions = db.query(Decision).filter(Decision.meeting_id == meeting_id).all()
    action_items_rows = db.query(ActionItem).filter(ActionItem.meeting_id == meeting_id).all()

    attendance_rows = db.execute(
        meeting_participants.select().where(meeting_participants.c.meeting_id == meeting_id)
    ).mappings().all()
    attendance = {row["participant_id"]: row["attendance_status"] for row in attendance_rows}
    participants = [
        {
            "name": p.name,
            "role": p.role_title or "Stakeholder",
            "email": p.email or "",
            "status": attendance.get(p.id, "present").title(),
        }
        for p in meeting.participants
    ]
    summary_text = summary.summary_text if summary else ""
    decision_texts = [d.text for d in decisions]

    action_items = [
        {
            "text": a.description,
            "assignee_name": a.assignee.full_name if a.assignee else None,
            "deadline": str(a.deadline) if a.deadline else None,
            "status": str(a.status),
            "priority": str(a.priority),
        }
        for a in action_items_rows
    ]

    setting_rows = db.query(SystemSetting).all()
    settings = {row.key: row.value for row in setting_rows}
    organization = {
        "name": settings.get("school_name", "Starlight Secondary School"),
        "address": settings.get("organization_address", ""),
        "phone": settings.get("organization_phone", ""),
        "email": settings.get("organization_email", ""),
        "website": settings.get("organization_website", ""),
        "motto": settings.get("organization_motto", ""),
        "registration": settings.get("organization_registration", ""),
        "logo_path": settings.get("school_logo_file", ""),
    }
    return (
        meeting, participants, summary_text, decision_texts, action_items,
        transcript.content if transcript else "", organization,
    )


@router.get("/{meeting_id}/export")
def export_meeting(
    meeting_id: int,
    format: str = Query(default="pdf", pattern="^(pdf|docx|txt)$"),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Generate and stream complete meeting minutes as PDF, DOCX, or TXT.
    Only the meeting owner and admins may export.
    """
    meeting, participants, summary_text, decisions, action_items, transcript_text, organization = \
        _gather_export_data(meeting_id, db)

    # Authorisation
    if current_user.role == UserRole.staff and meeting.status.value != "completed":
        raise HTTPException(status_code=403, detail="Staff readers can export completed minutes only")
    if current_user.role not in {UserRole.admin, UserRole.staff} and meeting.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorised to export this meeting")

    filename_base = meeting.title.replace(" ", "_").replace("/", "-")[:40]

    if format == "pdf":
        data = export_pdf(
            meeting_title=meeting.title,
            meeting_date=meeting.date,
            participants=participants,
            summary_text=summary_text,
            decisions=decisions,
            action_items=action_items,
            transcript_text=transcript_text,
            organization=organization,
            meeting_description=meeting.description or "",
        )
        return Response(
            content=data,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename_base}.pdf"'}
        )

    elif format == "docx":
        data = export_docx(
            meeting_title=meeting.title,
            meeting_date=meeting.date,
            participants=participants,
            summary_text=summary_text,
            decisions=decisions,
            action_items=action_items,
            transcript_text=transcript_text,
            organization=organization,
            meeting_description=meeting.description or "",
        )
        return Response(
            content=data,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{filename_base}.docx"'}
        )

    else:  # txt
        data = export_txt(
            meeting_title=meeting.title,
            meeting_date=meeting.date,
            participants=participants,
            summary_text=summary_text,
            decisions=decisions,
            action_items=action_items,
            transcript_text=transcript_text,
            organization=organization,
            meeting_description=meeting.description or "",
        )
        return Response(
            content=data,
            media_type="text/plain; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename_base}.txt"'}
        )


@router.get("/{meeting_id}/final-minutes/status")
def final_minutes_status(
    meeting_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if current_user.role == UserRole.staff and meeting.status.value != "completed":
        raise HTTPException(status_code=403, detail="Staff readers can access completed minutes only")
    if current_user.role not in {UserRole.admin, UserRole.staff} and meeting.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorised")
    path = _final_pdf_path(meeting_id)
    return {
        "is_final": path.is_file(),
        "finalized_at": path.stat().st_mtime if path.is_file() else None,
        "download_url": f"/api/meetings/{meeting_id}/final-minutes" if path.is_file() else None,
    }


@router.post("/{meeting_id}/finalize")
def finalize_and_share_minutes(
    meeting_id: int,
    request: Request,
    share: bool = Query(default=True),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_admin_user),
):
    meeting, participants, summary_text, decisions, action_items, transcript_text, organization = \
        _gather_export_data(meeting_id, db)
    if not summary_text:
        raise HTTPException(status_code=400, detail="Generate and review the minutes before finalizing")
    pdf_data = export_pdf(
        meeting_title=meeting.title,
        meeting_date=meeting.date,
        participants=participants,
        summary_text=summary_text,
        decisions=decisions,
        action_items=action_items,
        transcript_text=transcript_text,
        organization=organization,
        meeting_description=meeting.description or "",
    )
    path = _final_pdf_path(meeting_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_bytes(pdf_data)
    temporary.replace(path)

    recipients = sorted({p.email.strip() for p in meeting.participants if p.email and p.email.strip()})
    delivered = 0
    delivery_error = None
    if share and recipients:
        try:
            delivered = email_service.send_final_minutes(
                recipients=recipients,
                meeting_title=meeting.title,
                meeting_id=meeting.id,
                pdf_data=pdf_data,
                organization_name=organization["name"],
            )
        except Exception as error:
            delivery_error = str(error)

    log_action(
        db,
        action="finalize_and_share_minutes",
        details=(
            f"Finalized meeting {meeting_id}; requested recipients={len(recipients)}, "
            f"delivered={delivered}, delivery_error={delivery_error or 'none'}"
        ),
        user_id=current_user.id,
        user_email=current_user.email,
        ip_address=request.client.host if request.client else None,
    )
    return {
        "detail": "Final minutes saved",
        "is_final": True,
        "recipients": len(recipients),
        "delivered": delivered,
        "delivery_error": delivery_error,
        "download_url": f"/api/meetings/{meeting_id}/final-minutes",
    }


@router.get("/{meeting_id}/final-minutes")
def download_final_minutes(
    meeting_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if current_user.role == UserRole.staff and meeting.status.value == "completed":
        pass
    elif current_user.role != UserRole.admin and meeting.owner_id != current_user.id:
        participant_emails = {p.email for p in meeting.participants if p.email}
        if current_user.email not in participant_emails:
            raise HTTPException(status_code=403, detail="Not authorised")
    path = _final_pdf_path(meeting_id)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Final minutes are not available")
    safe_title = re.sub(r"[^A-Za-z0-9._-]+", "-", meeting.title).strip("-")[:50] or "meeting"
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=f"{safe_title}-final-minutes.pdf",
    )
