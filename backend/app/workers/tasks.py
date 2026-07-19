import os
import concurrent.futures
from datetime import date
from pathlib import Path
from celery import Celery
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.models import Meeting, MeetingStatus, Recording, Transcript, TranscriptSegment, ProcessingJob, JobStatus
from app.services.audio import normalise_audio
from app.services.transcription import transcription_service

# Initialize Celery app
celery_app = Celery(
    "meeting_tasks",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone=settings.TIMEZONE,
    enable_utc=True,
)

# Native Thread Pool fallback for local developer mode without Celery/Redis
local_executor = concurrent.futures.ThreadPoolExecutor(max_workers=3)

def run_background_job(task_func, *args, **kwargs):
    """
    Attempts to queue the task using Celery.
    If Redis is down or unavailable, falls back to the in-memory ThreadPoolExecutor.
    """
    if os.getenv("TESTING") == "true":
        print(f"[TEST] Skipping background queueing for '{task_func.__name__}' to prevent database race conditions in tests.")
        return
    try:
        # Check if Celery is ready to send tasks
        task_func.delay(*args, **kwargs)
        print(f"[INFO] Dispatched background job '{task_func.__name__}' to Celery queue.")
    except Exception as e:
        print(f"[WARNING] Celery/Redis broker unavailable ({str(e)}). Executing background job '{task_func.__name__}' in-process via ThreadPoolExecutor.")
        local_executor.submit(task_func, *args, **kwargs)

@celery_app.task(name="tasks.transcribe_meeting")
def transcribe_meeting(meeting_id: int, job_id: str):
    """
    Background pipeline: normalises audio using FFmpeg and transcribes with Faster-Whisper.
    Updates Database status and logs progress steps.
    """
    db: Session = SessionLocal()
    try:
        # Load meeting and associated recording
        meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
        if not meeting:
            print(f"[ERROR] Meeting {meeting_id} not found in database.")
            return

        recording = db.query(Recording).filter(Recording.meeting_id == meeting_id).first()
        if not recording:
            print(f"[ERROR] Recording for meeting {meeting_id} not found.")
            # Set job status to failed
            job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
            if job:
                job.status = JobStatus.failed
                job.error_message = "Recording file record not found"
                db.commit()
            return

        # Fetch job record
        job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
        if not job:
            job = ProcessingJob(id=job_id, meeting_id=meeting_id, status=JobStatus.queued, progress=0)
            db.add(job)
            db.commit()

        meeting.status = MeetingStatus.processing
        db.commit()

        # Step 1: Conversion (FFmpeg)
        job.status = JobStatus.converting
        job.progress = 20
        db.commit()

        # Determine target filepaths
        input_path = recording.filepath
        output_filename = f"normalised_{meeting_id}.wav"
        output_path = os.path.join(settings.UPLOAD_DIR, output_filename)

        # Convert
        duration = normalise_audio(input_path, output_path)
        
        # Save normalised path and duration back to database
        recording.duration_seconds = duration
        db.commit()

        # Step 2: Transcribing (Faster-Whisper)
        job.status = JobStatus.transcribing
        job.progress = 50
        db.commit()

        # Run transcription
        segments = transcription_service.transcribe(output_path)

        # Step 3: Write Transcript Records
        job.status = JobStatus.summarising
        job.progress = 85
        db.commit()

        # Assemble full text
        full_text = " ".join([seg["text"] for seg in segments])

        # Delete old transcript if retrying
        existing_transcript = db.query(Transcript).filter(Transcript.meeting_id == meeting_id).first()
        if existing_transcript:
            db.delete(existing_transcript)
            db.commit()

        transcript = Transcript(meeting_id=meeting_id, content=full_text)
        db.add(transcript)
        db.commit()
        db.refresh(transcript)

        # Insert segments
        for seg in segments:
            db_seg = TranscriptSegment(
                transcript_id=transcript.id,
                start_time=seg["start"],
                end_time=seg["end"],
                text=seg["text"],
                speaker=seg["speaker"]
            )
            db.add(db_seg)
        db.commit()

        # Step 4: Prefer Gemini structured minutes; use local TextRank as a fallback.
        try:
            import json
            from app.services.summarizer import summarize, extract_decisions, extract_action_items, extract_key_points
            from app.services.gemini import gemini_service
            from app.models.models import Summary, Decision, ActionItem

            try:
                if not gemini_service.enabled:
                    raise RuntimeError("Gemini is not configured")
                ai_minutes = gemini_service.summarize_transcript(full_text)
                summary_text = ai_minutes["summary"]
                key_points = ai_minutes["key_points"]
                decision_texts = ai_minutes["decisions"]
                action_candidates = [
                    {
                        "text": item["description"],
                        "priority": item.get("priority", "medium"),
                        "deadline": (
                            date.fromisoformat(item["due_date"])
                            if item.get("due_date")
                            else None
                        ),
                    }
                    for item in ai_minutes["action_items"]
                ]
                summary_provider = f"Gemini ({settings.GEMINI_MODEL})"
            except Exception as gemini_err:
                print(f"[WARNING] Gemini unavailable; using TextRank fallback: {gemini_err}")
                summary_text = summarize(full_text, sentence_count=6)
                key_points = extract_key_points(full_text, count=5)
                decision_texts = extract_decisions(full_text)
                action_candidates = extract_action_items(full_text)
                summary_provider = "TextRank fallback"

            # Upsert Summary
            existing_summary = db.query(Summary).filter(Summary.meeting_id == meeting_id).first()
            if existing_summary:
                existing_summary.summary_text = summary_text
                existing_summary.key_points_json = json.dumps(key_points)
                summary_row = existing_summary
            else:
                summary_row = Summary(
                    meeting_id=meeting_id,
                    summary_text=summary_text,
                    key_points_json=json.dumps(key_points)
                )
                db.add(summary_row)
            db.commit()
            db.refresh(summary_row)

            # Write decisions (idempotent)
            db.query(Decision).filter(
                Decision.meeting_id == meeting_id,
                Decision.summary_id == summary_row.id
            ).delete()
            for d_text in decision_texts:
                db.add(Decision(meeting_id=meeting_id, summary_id=summary_row.id, text=d_text))

            # Write action item candidates (only on first run)
            existing_actions = db.query(ActionItem).filter(
                ActionItem.meeting_id == meeting_id,
                ActionItem.summary_id == summary_row.id
            ).count()
            if existing_actions == 0:
                for candidate in action_candidates:
                    db.add(ActionItem(
                        meeting_id=meeting_id,
                        summary_id=summary_row.id,
                        description=candidate["text"],
                        status="pending",
                        priority=candidate.get("priority", "medium"),
                        deadline=candidate.get("deadline"),
                    ))

            db.commit()
            print(f"[SUCCESS] {summary_provider} summary generated: {len(decision_texts)} decisions, {len(action_candidates)} action items.")

        except Exception as sum_err:
            print(f"[WARNING] Auto-summarisation failed (non-fatal): {sum_err}")
            summary_text = ""

        # Finalise
        job.status = JobStatus.completed
        job.progress = 100
        meeting.status = MeetingStatus.completed
        db.commit()

        # Notify participants after all durable records have been committed.
        try:
            from app.services.email import email_service

            recipients = [participant.email for participant in meeting.participants if participant.email]
            if meeting.created_by and meeting.created_by.email:
                recipients.append(meeting.created_by.email)
            sent = email_service.send_meeting_complete(
                recipients=recipients,
                meeting_title=meeting.title,
                meeting_id=meeting.id,
                summary=summary_text or "The transcript and meeting minutes are now available.",
            )
            print(f"[SUCCESS] Sent meeting completion notification to {sent} recipient(s).")
        except Exception as email_err:
            print(f"[WARNING] Email notification failed (non-fatal): {email_err}")

        print(f"[SUCCESS] Meeting {meeting_id} transcribed successfully. Duration: {duration}s.")

    except Exception as e:
        db.rollback()
        print(f"[ERROR] Task failed for meeting {meeting_id}: {str(e)}")
        
        # Save failure state to Database
        try:
            meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
            if meeting:
                meeting.status = MeetingStatus.failed
                
            job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
            if job:
                job.status = JobStatus.failed
                job.error_message = str(e)
                job.progress = 0
            db.commit()
        except Exception as db_err:
            print(f"[CRITICAL] Could not write failure state to DB: {db_err}")

    finally:
        db.close()
