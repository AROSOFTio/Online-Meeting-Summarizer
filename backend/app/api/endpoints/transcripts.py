from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core import deps
from app.core.audit import log_action
from app.models.models import MeetingStatus, Transcript, TranscriptRevision, TranscriptSegment, User, UserRole

router = APIRouter()


class SegmentUpdate(BaseModel):
    text: str
    speaker: Optional[str] = None


class TranscriptFullUpdate(BaseModel):
    content: str
    reason: Optional[str] = "Manual revision"


def _can_read(transcript: Transcript, user: User) -> bool:
    meeting = transcript.meeting
    if user.role in {UserRole.admin, UserRole.minute_secretary}:
        return True
    if user.role == UserRole.staff and meeting.status == MeetingStatus.completed:
        return True
    if meeting.owner_id == user.id:
        return True
    return user.email in {p.email for p in meeting.participants if p.email}


def _can_edit(transcript: Transcript, user: User) -> bool:
    return user.role == UserRole.admin or transcript.meeting.owner_id == user.id


@router.get("/{meeting_id}")
def get_transcript(
    meeting_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    transcript = db.query(Transcript).filter(Transcript.meeting_id == meeting_id).first()
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript not found for this meeting")
    if not _can_read(transcript, current_user):
        raise HTTPException(status_code=403, detail="You are not authorised to view this transcript")

    segments = db.query(TranscriptSegment).filter(TranscriptSegment.transcript_id == transcript.id).order_by(TranscriptSegment.start_time.asc()).all()
    revisions = db.query(TranscriptRevision).filter(TranscriptRevision.transcript_id == transcript.id).order_by(TranscriptRevision.created_at.desc()).all()
    return {
        "id": transcript.id,
        "meeting_id": transcript.meeting_id,
        "content": transcript.content,
        "segments": [{"id": s.id, "start_time": s.start_time, "end_time": s.end_time, "text": s.text, "speaker": s.speaker} for s in segments],
        "revisions": [{
            "id": r.id,
            "editor": r.editor.full_name if r.editor else "Deleted User",
            "old_content": r.old_content[:100] + "..." if len(r.old_content) > 100 else r.old_content,
            "new_content": r.new_content[:100] + "..." if len(r.new_content) > 100 else r.new_content,
            "reason": r.reason,
            "created_at": r.created_at.isoformat(),
        } for r in revisions],
    }


@router.put("/{meeting_id}/segments/{segment_id}")
def update_transcript_segment(
    meeting_id: int,
    segment_id: int,
    request: Request,
    segment_in: SegmentUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_minutes_editor),
):
    transcript = db.query(Transcript).filter(Transcript.meeting_id == meeting_id).first()
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript not found")
    if not _can_edit(transcript, current_user):
        raise HTTPException(status_code=403, detail="Not authorised to edit this transcript")
    segment = db.query(TranscriptSegment).filter(TranscriptSegment.id == segment_id, TranscriptSegment.transcript_id == transcript.id).first()
    if not segment:
        raise HTTPException(status_code=404, detail="Transcript segment not found")
    text_value = segment_in.text.strip()
    if not text_value:
        raise HTTPException(status_code=400, detail="Segment text cannot be empty")

    old_text, old_speaker = segment.text, segment.speaker
    segment.text = text_value
    if segment_in.speaker is not None:
        segment.speaker = segment_in.speaker.strip() or "Speaker"
    all_segments = db.query(TranscriptSegment).filter(TranscriptSegment.transcript_id == transcript.id).order_by(TranscriptSegment.start_time.asc()).all()
    transcript.content = " ".join(s.text for s in all_segments)
    db.add(TranscriptRevision(
        transcript_id=transcript.id,
        editor_id=current_user.id,
        old_content=f"[{old_speaker or 'Speaker'}]: {old_text}",
        new_content=f"[{segment.speaker or 'Speaker'}]: {segment.text}",
        reason="Segment text modification",
    ))
    db.commit()
    log_action(db, action="edit_transcript_segment", details=f"Edited segment {segment_id} on meeting {meeting_id}", user_id=current_user.id, user_email=current_user.email, ip_address=request.client.host if request.client else None)
    return {"id": segment.id, "start_time": segment.start_time, "end_time": segment.end_time, "text": segment.text, "speaker": segment.speaker}


@router.post("/{meeting_id}/revision")
def update_full_transcript(
    meeting_id: int,
    request: Request,
    transcript_in: TranscriptFullUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_minutes_editor),
):
    transcript = db.query(Transcript).filter(Transcript.meeting_id == meeting_id).first()
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript not found")
    if not _can_edit(transcript, current_user):
        raise HTTPException(status_code=403, detail="Not authorised to edit this transcript")
    new_content = transcript_in.content.strip()
    if not new_content:
        raise HTTPException(status_code=400, detail="Transcript cannot be empty")
    old_content = transcript.content
    transcript.content = new_content
    db.add(TranscriptRevision(transcript_id=transcript.id, editor_id=current_user.id, old_content=old_content, new_content=new_content, reason=transcript_in.reason))
    db.commit()
    log_action(db, action="edit_transcript_full", details=f"Rewrote full transcript for meeting {meeting_id}", user_id=current_user.id, user_email=current_user.email, ip_address=request.client.host if request.client else None)
    return {"detail": "Full transcript updated successfully"}
