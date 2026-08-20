import concurrent.futures
import json
import os
import re
from datetime import date

from celery import Celery
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.models import (
    ActionItem, ActionItemPriority, ActionItemStatus, Decision, JobStatus, Meeting,
    MeetingStatus, ProcessingJob, Recording, Summary, Transcript, TranscriptSegment,
    meeting_participants,
)
from app.services.audio import normalise_audio
from app.services.transcription import transcription_service

celery_app = Celery("meeting_tasks", broker=settings.REDIS_URL, backend=settings.REDIS_URL)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone=settings.TIMEZONE,
    enable_utc=True,
)
local_executor = concurrent.futures.ThreadPoolExecutor(max_workers=3)


def run_background_job(task_func, *args, **kwargs):
    if os.getenv("TESTING") == "true":
        print(f"[TEST] Skipping background queueing for '{task_func.__name__}'.")
        return
    try:
        task_func.delay(*args, **kwargs)
        print(f"[INFO] Dispatched '{task_func.__name__}' to Celery.")
    except Exception as exc:
        print(f"[WARNING] Celery unavailable ({exc}); running '{task_func.__name__}' in-process.")
        local_executor.submit(task_func, *args, **kwargs)


def _safe_due_date(value):
    if not value:
        return None
    try:
        return date.fromisoformat(str(value))
    except (TypeError, ValueError):
        return None


def _agenda_from_description(description: str) -> list[str]:
    text = (description or "").strip()
    if not text:
        return []
    items = []
    for raw in re.split(r"(?:\r?\n|;)+", text):
        value = re.sub(r"^\s*(?:\d+[\.\)]|[-•])\s*", "", raw).strip()
        if value:
            items.append(value)
    return items


def _merge_agenda(supplied: list[str], inferred: list[str]) -> list[str]:
    merged: list[str] = []
    seen: set[str] = set()
    for item in [*supplied, *inferred]:
        value = str(item).strip()
        if not value:
            continue
        key = re.sub(r"\s+", " ", value).casefold()
        if key in seen:
            continue
        seen.add(key)
        merged.append(value)
    return merged or ["General Meeting Proceedings"]


def _local_minutes(text: str):
    from app.services.summarizer import extract_action_items, extract_decisions, extract_key_points, summarize
    key_points = extract_key_points(text, count=5)
    agenda = [point.strip() for point in key_points if point and point.strip()]
    if not agenda:
        agenda = ["General Meeting Proceedings"]
    return {
        "agenda": agenda,
        "summary": summarize(text, sentence_count=6),
        "key_points": key_points,
        "decisions": extract_decisions(text),
        "action_items": extract_action_items(text),
    }


def _store_minutes(db: Session, meeting_id: int, full_text: str) -> str:
    from app.services.gemini import gemini_service
    try:
        result = gemini_service.summarize_transcript(full_text) if gemini_service.enabled else _local_minutes(full_text)
    except Exception as exc:
        print(f"[WARNING] Gemini minutes generation failed; using deterministic fallback: {exc}")
        result = _local_minutes(full_text)

    inferred_agenda = [str(item).strip() for item in (result.get("agenda") or []) if str(item).strip()]
    if not inferred_agenda:
        inferred_agenda = ["General Meeting Proceedings"]
    summary_text = result.get("summary") or full_text[:4000]
    key_points = result.get("key_points") or []
    decisions = result.get("decisions") or []
    action_items = result.get("action_items") or []

    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if meeting:
        agenda = _merge_agenda(_agenda_from_description(meeting.description or ""), inferred_agenda)
        meeting.description = "\n".join(f"{index}. {item}" for index, item in enumerate(agenda, 1))

    summary = db.query(Summary).filter(Summary.meeting_id == meeting_id).first()
    if summary:
        summary.summary_text = summary_text
        summary.key_points_json = json.dumps(key_points)
    else:
        summary = Summary(meeting_id=meeting_id, summary_text=summary_text, key_points_json=json.dumps(key_points))
        db.add(summary)
    db.flush()

    db.query(Decision).filter(Decision.meeting_id == meeting_id).delete(synchronize_session=False)
    for item in decisions:
        text_value = str(item).strip()
        if text_value:
            db.add(Decision(meeting_id=meeting_id, summary_id=summary.id, text=text_value))

    if db.query(ActionItem).filter(ActionItem.meeting_id == meeting_id).count() == 0:
        for item in action_items:
            responsible_name = None
            if isinstance(item, dict):
                description = str(item.get("description") or item.get("text") or "").strip()
                priority_value = str(item.get("priority") or "medium").lower()
                due_value = item.get("due_date") or item.get("deadline") or item.get("raw_deadline")
                responsible_name = str(item.get("assignee") or item.get("responsible_name") or "").strip() or None
            else:
                description = str(item).strip()
                priority_value = "medium"
                due_value = None
            if not description:
                continue
            priority = {
                "low": ActionItemPriority.low,
                "high": ActionItemPriority.high,
            }.get(priority_value, ActionItemPriority.medium)
            db.add(ActionItem(
                meeting_id=meeting_id,
                summary_id=summary.id,
                description=description,
                responsible_name=responsible_name,
                status=ActionItemStatus.pending,
                priority=priority,
                deadline=_safe_due_date(due_value),
            ))
    db.commit()
    return summary_text


@celery_app.task(name="tasks.transcribe_meeting")
def transcribe_meeting(meeting_id: int, job_id: str):
    db: Session = SessionLocal()
    normalized_path = os.path.join(settings.UPLOAD_DIR, f"normalised_{meeting_id}.wav")
    try:
        meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
        job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
        recording = db.query(Recording).filter(Recording.meeting_id == meeting_id).first()
        if not meeting:
            raise RuntimeError(f"Meeting {meeting_id} was not found")
        if not recording:
            raise RuntimeError("Recording file record not found")
        if not job:
            job = ProcessingJob(id=job_id, meeting_id=meeting_id, status=JobStatus.queued, progress=0)
            db.add(job)

        meeting.status = MeetingStatus.processing
        job.error_message = None
        job.status = JobStatus.converting
        job.progress = 20
        db.commit()

        duration = normalise_audio(recording.filepath, normalized_path)
        recording.duration_seconds = duration
        job.status = JobStatus.transcribing
        job.progress = 50
        db.commit()

        attendance_rows = db.execute(
            meeting_participants.select().where(
                meeting_participants.c.meeting_id == meeting_id,
                meeting_participants.c.attendance_status == "present",
            )
        ).mappings().all()
        present_ids = {row["participant_id"] for row in attendance_rows}
        participant_names = [
            participant.name
            for participant in meeting.participants
            if participant.id in present_ids and participant.name
        ]
        segments = transcription_service.transcribe(normalized_path, participant_names=participant_names)
        from app.services.speaker_detection import speaker_detection_service
        segments = speaker_detection_service.match_speakers_to_attendance(segments, participant_names)

        full_text = " ".join(str(segment.get("text", "")).strip() for segment in segments if segment.get("text")).strip()
        if not full_text:
            raise RuntimeError("Transcription completed but no speech text was returned")

        existing = db.query(Transcript).filter(Transcript.meeting_id == meeting_id).first()
        if existing:
            db.delete(existing)
            db.flush()
        transcript = Transcript(meeting_id=meeting_id, content=full_text)
        db.add(transcript)
        db.flush()
        for segment in segments:
            text_value = str(segment.get("text", "")).strip()
            if not text_value:
                continue
            start = max(0.0, float(segment.get("start", 0.0) or 0.0))
            end = max(start, float(segment.get("end", start) or start))
            db.add(TranscriptSegment(
                transcript_id=transcript.id,
                start_time=start,
                end_time=end,
                text=text_value,
                speaker=str(segment.get("speaker") or "Speaker").strip(),
            ))

        job.status = JobStatus.summarising
        job.progress = 85
        db.commit()
        summary_text = _store_minutes(db, meeting_id, full_text)

        meeting.status = MeetingStatus.completed
        job.status = JobStatus.completed
        job.progress = 100
        job.error_message = None
        db.commit()

        try:
            from app.services.email import email_service
            recipients = [p.email for p in meeting.participants if p.email]
            if meeting.owner and meeting.owner.email:
                recipients.append(meeting.owner.email)
            if recipients and email_service.enabled:
                sent = email_service.send_meeting_complete(
                    recipients=recipients,
                    meeting_title=meeting.title,
                    meeting_id=meeting.id,
                    summary=summary_text or "The transcript and meeting minutes are now available.",
                )
                print(f"[SUCCESS] Sent completion notification to {sent} recipient(s).")
        except Exception as email_error:
            print(f"[WARNING] Completion email failed (non-fatal): {email_error}")

        print(f"[SUCCESS] Meeting {meeting_id} processed successfully. Duration: {duration:.1f}s")
    except Exception as exc:
        db.rollback()
        print(f"[ERROR] Processing meeting {meeting_id} failed: {exc}")
        try:
            meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
            job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
            if meeting:
                meeting.status = MeetingStatus.failed
            if job:
                job.status = JobStatus.failed
                job.error_message = str(exc)
            db.commit()
        except Exception as db_error:
            db.rollback()
            print(f"[CRITICAL] Could not persist failure state: {db_error}")
    finally:
        db.close()
