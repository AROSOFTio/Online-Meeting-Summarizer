from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel

from app.core import deps
from app.core.audit import log_action
from app.models.models import Meeting, Transcript, TranscriptSegment, TranscriptRevision, User, UserRole

router = APIRouter()

class SegmentUpdate(BaseModel):
    text: str
    speaker: Optional[str] = None

class TranscriptFullUpdate(BaseModel):
    content: str
    reason: Optional[str] = "Manual revision"

@router.get("/{meeting_id}")
def get_transcript(
    meeting_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Retrieve full transcript, segments, and history for a meeting."""
    transcript = db.query(Transcript).filter(Transcript.meeting_id == meeting_id).first()
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript not found for this meeting")

    # Authorisation check
    meeting = transcript.meeting
    if current_user.role != UserRole.admin and meeting.owner_id != current_user.id:
        participant_emails = [p.email for p in meeting.participants if p.email]
        if current_user.email not in participant_emails:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not authorised to view this transcript"
            )

    segments = db.query(TranscriptSegment).filter(TranscriptSegment.transcript_id == transcript.id).order_by(TranscriptSegment.start_time.asc()).all()
    revisions = db.query(TranscriptRevision).filter(TranscriptRevision.transcript_id == transcript.id).order_by(TranscriptRevision.created_at.desc()).all()

    segments_out = [
        {
            "id": s.id,
            "start_time": s.start_time,
            "end_time": s.end_time,
            "text": s.text,
            "speaker": s.speaker
        } for s in segments
    ]

    revisions_out = [
        {
            "id": r.id,
            "editor": r.editor.full_name if r.editor else "Deleted User",
            "old_content": r.old_content[:100] + "..." if len(r.old_content) > 100 else r.old_content,
            "new_content": r.new_content[:100] + "..." if len(r.new_content) > 100 else r.new_content,
            "reason": r.reason,
            "created_at": r.created_at.isoformat()
        } for r in revisions
    ]

    return {
        "id": transcript.id,
        "meeting_id": transcript.meeting_id,
        "content": transcript.content,
        "segments": segments_out,
        "revisions": revisions_out
    }

@router.put("/{meeting_id}/segments/{segment_id}")
def update_transcript_segment(
    meeting_id: int,
    segment_id: int,
    request: Request,
    segment_in: SegmentUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_minutes_editor)
):
    """Edit a single transcript segment and record it in revision history and audit log."""
    transcript = db.query(Transcript).filter(Transcript.meeting_id == meeting_id).first()
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript not found")

    meeting = transcript.meeting
    if current_user.role != UserRole.admin and meeting.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorised to edit this transcript")

    segment = db.query(TranscriptSegment).filter(
        TranscriptSegment.id == segment_id,
        TranscriptSegment.transcript_id == transcript.id
    ).first()
    
    if not segment:
        raise HTTPException(status_code=404, detail="Transcript segment not found")

    old_text = segment.text
    old_speaker = segment.speaker

    # Make updates
    segment.text = segment_in.text
    if segment_in.speaker is not None:
        segment.speaker = segment_in.speaker
        
    db.commit()

    # Reassemble full content text
    all_segments = db.query(TranscriptSegment).filter(TranscriptSegment.transcript_id == transcript.id).order_by(TranscriptSegment.start_time.asc()).all()
    transcript.content = " ".join([s.text for s in all_segments])
    
    # Save revision log
    revision = TranscriptRevision(
        transcript_id=transcript.id,
        editor_id=current_user.id,
        old_content=f"[{old_speaker or 'Speaker'}]: {old_text}",
        new_content=f"[{segment.speaker or 'Speaker'}]: {segment.text}",
        reason="Segment text modification"
    )
    db.add(revision)
    db.commit()

    log_action(
        db,
        action="edit_transcript_segment",
        details=f"Edited segment {segment_id} on meeting {meeting_id}. Old: '{old_text}' -> New: '{segment.text}'",
        user_id=current_user.id,
        user_email=current_user.email,
        ip_address=request.client.host if request.client else None
    )

    return {
        "id": segment.id,
        "start_time": segment.start_time,
        "end_time": segment.end_time,
        "text": segment.text,
        "speaker": segment.speaker
    }

@router.post("/{meeting_id}/revision")
def update_full_transcript(
    meeting_id: int,
    request: Request,
    transcript_in: TranscriptFullUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_minutes_editor)
):
    """Overwrite transcript full text and archive a complete revision history."""
    transcript = db.query(Transcript).filter(Transcript.meeting_id == meeting_id).first()
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript not found")

    meeting = transcript.meeting
    if current_user.role != UserRole.admin and meeting.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorised to edit this transcript")

    old_content = transcript.content
    transcript.content = transcript_in.content

    revision = TranscriptRevision(
        transcript_id=transcript.id,
        editor_id=current_user.id,
        old_content=old_content,
        new_content=transcript_in.content,
        reason=transcript_in.reason
    )
    db.add(revision)
    db.commit()

    log_action(
        db,
        action="edit_transcript_full",
        details=f"Rewrote full transcript text for meeting {meeting_id}. Reason: {transcript_in.reason}",
        user_id=current_user.id,
        user_email=current_user.email,
        ip_address=request.client.host if request.client else None
    )

    return {"detail": "Full transcript updated successfully"}
