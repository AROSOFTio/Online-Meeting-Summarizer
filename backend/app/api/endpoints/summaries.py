import json
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from typing import List

from app.core import deps
from app.core.audit import log_action
from app.models.models import (
    Meeting, Transcript, Summary, Decision, ActionItem,
    MeetingStatus, User, UserRole
)
from app.services.summarizer import summarize, extract_decisions, extract_action_items, extract_key_points

router = APIRouter()


@router.post("/{meeting_id}/generate")
def generate_summary(
    meeting_id: int,
    request: Request,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Run TextRank on the meeting transcript and store summary, decisions, and action item candidates."""
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    if meeting.status != MeetingStatus.completed:
        raise HTTPException(status_code=400, detail="Meeting transcript is not yet complete")

    transcript = db.query(Transcript).filter(Transcript.meeting_id == meeting_id).first()
    if not transcript or not transcript.content:
        raise HTTPException(status_code=404, detail="No transcript content found")

    # Authorisation
    if current_user.role != UserRole.admin and meeting.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorised")

    text = transcript.content

    # Run TextRank
    summary_text = summarize(text, sentence_count=6)
    key_points = extract_key_points(text, count=5)
    decision_texts = extract_decisions(text)
    action_candidates = extract_action_items(text)

    # Upsert Summary row
    existing = db.query(Summary).filter(Summary.meeting_id == meeting_id).first()
    if existing:
        existing.summary_text = summary_text
        existing.key_points_json = json.dumps(key_points)
        summary = existing
    else:
        summary = Summary(
            meeting_id=meeting_id,
            summary_text=summary_text,
            key_points_json=json.dumps(key_points)
        )
        db.add(summary)
    db.commit()
    db.refresh(summary)

    # Delete old decisions and recreate (idempotent re-run)
    db.query(Decision).filter(
        Decision.meeting_id == meeting_id,
        Decision.summary_id == summary.id
    ).delete()
    db.commit()

    for d_text in decision_texts:
        d = Decision(meeting_id=meeting_id, summary_id=summary.id, text=d_text)
        db.add(d)

    # Create action item candidates (only if no existing ones to avoid duplicates on re-run)
    existing_actions = db.query(ActionItem).filter(
        ActionItem.meeting_id == meeting_id,
        ActionItem.summary_id == summary.id
    ).count()

    if existing_actions == 0:
        for candidate in action_candidates:
            a = ActionItem(
                meeting_id=meeting_id,
                summary_id=summary.id,
                description=candidate["text"],
                status="pending",
                priority="medium",
            )
            db.add(a)

    db.commit()

    log_action(
        db,
        action="generate_summary",
        details=f"Generated TextRank summary for meeting {meeting_id}. "
                f"{len(decision_texts)} decisions, {len(action_candidates)} action candidates.",
        user_id=current_user.id,
        user_email=current_user.email,
        ip_address=request.client.host if request.client else None
    )

    return {
        "summary_id": summary.id,
        "text": summary.summary_text,
        "key_points": key_points,
        "decisions_count": len(decision_texts),
        "action_items_count": len(action_candidates)
    }


@router.get("/{meeting_id}")
def get_summary(
    meeting_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Fetch current summary, key points, and decisions for a meeting."""
    summary = db.query(Summary).filter(Summary.meeting_id == meeting_id).first()
    if not summary:
        raise HTTPException(status_code=404, detail="No summary found. Generate one first.")

    decisions = db.query(Decision).filter(Decision.meeting_id == meeting_id).all()

    try:
        key_points = json.loads(summary.key_points_json or "[]")
    except Exception:
        key_points = []

    return {
        "id": summary.id,
        "meeting_id": summary.meeting_id,
        "text": summary.summary_text,
        "key_points": key_points,
        "decisions": [{"id": d.id, "text": d.text} for d in decisions],
        "created_at": summary.created_at.isoformat(),
        "updated_at": summary.updated_at.isoformat(),
    }


@router.put("/{meeting_id}")
def update_summary(
    meeting_id: int,
    request: Request,
    body: dict,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Manually edit summary text or key points."""
    summary = db.query(Summary).filter(Summary.meeting_id == meeting_id).first()
    if not summary:
        raise HTTPException(status_code=404, detail="Summary not found")

    meeting = summary.meeting
    if current_user.role != UserRole.admin and meeting.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorised")

    if "text" in body:
        summary.summary_text = body["text"]
    if "key_points" in body:
        summary.key_points_json = json.dumps(body["key_points"])

    db.commit()
    db.refresh(summary)

    log_action(
        db,
        action="edit_summary",
        details=f"Manually edited summary for meeting {meeting_id}",
        user_id=current_user.id,
        user_email=current_user.email,
        ip_address=request.client.host if request.client else None
    )

    return {"detail": "Summary updated"}


@router.post("/{meeting_id}/decisions")
def add_decision(
    meeting_id: int,
    request: Request,
    body: dict,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Manually add a decision to a meeting."""
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if current_user.role != UserRole.admin and meeting.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorised")

    text = body.get("text", "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Decision text is required")

    summary = db.query(Summary).filter(Summary.meeting_id == meeting_id).first()
    d = Decision(
        meeting_id=meeting_id,
        summary_id=summary.id if summary else None,
        text=text
    )
    db.add(d)
    db.commit()
    db.refresh(d)

    log_action(db, action="add_decision",
               details=f"Added decision to meeting {meeting_id}",
               user_id=current_user.id, user_email=current_user.email,
               ip_address=request.client.host if request.client else None)

    return {"id": d.id, "text": d.text}


@router.delete("/{meeting_id}/decisions/{decision_id}")
def delete_decision(
    meeting_id: int,
    decision_id: int,
    request: Request,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Delete a decision."""
    decision = db.query(Decision).filter(
        Decision.id == decision_id,
        Decision.meeting_id == meeting_id
    ).first()
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    meeting = decision.meeting
    if current_user.role != UserRole.admin and meeting.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorised")

    db.delete(decision)
    db.commit()
    return {"detail": "Decision deleted"}
