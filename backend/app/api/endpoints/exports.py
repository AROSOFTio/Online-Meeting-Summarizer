from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core import deps
from app.models.models import Meeting, Transcript, Summary, Decision, ActionItem, User, UserRole
from app.services.export import export_pdf, export_docx, export_txt

router = APIRouter()


def _gather_export_data(meeting_id: int, db: Session):
    """Collect all data needed for export from the database."""
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    transcript = db.query(Transcript).filter(Transcript.meeting_id == meeting_id).first()
    summary = db.query(Summary).filter(Summary.meeting_id == meeting_id).first()
    decisions = db.query(Decision).filter(Decision.meeting_id == meeting_id).all()
    action_items_rows = db.query(ActionItem).filter(ActionItem.meeting_id == meeting_id).all()

    participants = [p.name for p in meeting.participants]
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

    return meeting, participants, summary_text, decision_texts, action_items, \
           transcript.content if transcript else ""


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
    meeting, participants, summary_text, decisions, action_items, transcript_text = \
        _gather_export_data(meeting_id, db)

    # Authorisation
    if current_user.role != UserRole.admin and meeting.owner_id != current_user.id:
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
            transcript_text=transcript_text
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
            transcript_text=transcript_text
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
            transcript_text=transcript_text
        )
        return Response(
            content=data,
            media_type="text/plain; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename_base}.txt"'}
        )
