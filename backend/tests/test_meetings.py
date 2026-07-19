import os
import wave
import struct
import math
import pytest
from datetime import datetime, timezone

from app.models.models import Meeting, MeetingStatus, Participant, Recording, Transcript, TranscriptSegment, ProcessingJob, JobStatus, User, AuditLog
from app.workers.tasks import transcribe_meeting

def create_dummy_wav(path: str, duration: float = 2.0):
    """Programmatically generate a 16kHz mono 16-bit PCM WAV file for audio tests."""
    sample_rate = 16000
    num_samples = int(duration * sample_rate)
    
    # Ensure directory exists
    os.makedirs(os.path.dirname(path), exist_ok=True)
    
    with wave.open(path, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        for i in range(num_samples):
            # 440Hz sine wave tone
            value = int(16384.0 * math.sin(2.0 * math.pi * 440.0 * i / sample_rate))
            wav.writeframesraw(struct.pack("<h", value))

@pytest.fixture(scope="function")
def speech_wav_fixture():
    fixture_path = "./tests/fixtures/speech.wav"
    create_dummy_wav(fixture_path, duration=1.5)
    yield fixture_path
    if os.path.exists(fixture_path):
        try:
            os.remove(fixture_path)
        except Exception:
            pass

def test_meeting_create_and_read(client, db):
    # 1. Login as admin
    client.post(
        "/api/auth/login",
        data={"username": "testadmin@starlight.sc.ug", "password": "TestAdminPass123!"}
    )
    
    # 2. Create meeting metadata
    meeting_data = {
      "title": "Starlight Staff General Meeting",
      "description": "Discussing the term two layout plans and district reports.",
      "date": datetime.now(timezone.utc).isoformat(),
      "participants": [
          {"name": "Principal Okello", "email": "okello@starlight.sc.ug", "role_title": "Principal"},
          {"name": "Teacher Akello", "email": "akello@starlight.sc.ug", "role_title": "Academic Registrar"}
      ]
    }
    
    res = client.post("/api/meetings/", json=meeting_data)
    assert res.status_code == 201
    meeting = res.json()
    assert meeting["title"] == "Starlight Staff General Meeting"
    assert len(meeting["participants"]) == 2
    
    # 3. Retrieve meeting details
    get_res = client.get(f"/api/meetings/{meeting['id']}")
    assert get_res.status_code == 200
    assert get_res.json()["description"] == "Discussing the term two layout plans and district reports."

def test_recording_upload_and_validation(client, db, speech_wav_fixture):
    # Login
    client.post(
        "/api/auth/login",
        data={"username": "testadmin@starlight.sc.ug", "password": "TestAdminPass123!"}
    )
    
    # Create draft meeting
    meeting_res = client.post("/api/meetings/", json={
      "title": "Audio Upload Test Meeting",
      "date": datetime.now(timezone.utc).isoformat(),
      "participants": []
    })
    meeting_id = meeting_res.json()["id"]

    # 1. Test invalid MIME/extension upload
    invalid_file = ("bad_file.txt", b"dummy txt content", "text/plain")
    upload_res = client.post(
        "/api/recordings/upload/{}".format(meeting_id),
        files={"file": invalid_file}
    )
    assert upload_res.status_code == 400
    assert "Unsupported file extension" in upload_res.json()["detail"]

    # 2. Test valid WAV upload
    with open(speech_wav_fixture, "rb") as f:
        valid_file = ("speech.wav", f.read(), "audio/wav")
        
    upload_res = client.post(
        "/api/recordings/upload/{}".format(meeting_id),
        files={"file": valid_file}
    )
    assert upload_res.status_code == 200
    rec_data = upload_res.json()
    assert rec_data["filename"] == "speech.wav"
    assert rec_data["mime_type"] == "audio/wav"

    # Verify database entry
    recording = db.query(Recording).filter(Recording.meeting_id == meeting_id).first()
    assert recording is not None
    assert os.path.exists(recording.filepath)
    
    # Clean up physical file
    if os.path.exists(recording.filepath):
        try:
            os.remove(recording.filepath)
        except Exception:
            pass

def test_transcription_pipeline(client, db, speech_wav_fixture, monkeypatch):
    # Mock Whisper to avoid downloading base weights during standard test runs
    monkeypatch.setenv("MOCK_WHISPER", "true")
    
    # Login
    client.post(
        "/api/auth/login",
        data={"username": "testadmin@starlight.sc.ug", "password": "TestAdminPass123!"}
    )
    
    # Create meeting and upload audio
    meeting_res = client.post("/api/meetings/", json={
      "title": "Pipeline Test Meeting",
      "date": datetime.now(timezone.utc).isoformat(),
      "participants": []
    })
    meeting_id = meeting_res.json()["id"]

    with open(speech_wav_fixture, "rb") as f:
        valid_file = ("speech.wav", f.read(), "audio/wav")
    client.post("/api/recordings/upload/{}".format(meeting_id), files={"file": valid_file})

    # Trigger transcription
    transcribe_res = client.post(f"/api/meetings/{meeting_id}/transcribe")
    assert transcribe_res.status_code == 200
    job_id = transcribe_res.json()["id"]

    # Execute task synchronously for test purposes
    transcribe_meeting(meeting_id, job_id)

    # Check database status updates
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    assert meeting.status == MeetingStatus.completed

    job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
    assert job.status == JobStatus.completed
    assert job.progress == 100

    transcript = db.query(Transcript).filter(Transcript.meeting_id == meeting_id).first()
    assert transcript is not None
    assert "Welcome to the Starlight Secondary School" in transcript.content

    segments = db.query(TranscriptSegment).filter(TranscriptSegment.transcript_id == transcript.id).all()
    assert len(segments) > 0
    assert segments[0].speaker == "Speaker 1"

    # Clean up physical file
    recording = db.query(Recording).filter(Recording.meeting_id == meeting_id).first()
    if recording and os.path.exists(recording.filepath):
        try:
            os.remove(recording.filepath)
        except Exception:
            pass

def test_transcript_segment_edit(client, db, speech_wav_fixture, monkeypatch):
    # Setup meeting with transcript
    monkeypatch.setenv("MOCK_WHISPER", "true")
    client.post(
        "/api/auth/login",
        data={"username": "testadmin@starlight.sc.ug", "password": "TestAdminPass123!"}
    )
    meeting_res = client.post("/api/meetings/", json={
      "title": "Segment Edit Test Meeting",
      "date": datetime.now(timezone.utc).isoformat(),
      "participants": []
    })
    meeting_id = meeting_res.json()["id"]
    with open(speech_wav_fixture, "rb") as f:
        valid_file = ("speech.wav", f.read(), "audio/wav")
    client.post("/api/recordings/upload/{}".format(meeting_id), files={"file": valid_file})
    transcribe_res = client.post(f"/api/meetings/{meeting_id}/transcribe")
    job_id = transcribe_res.json()["id"]
    transcribe_meeting(meeting_id, job_id)

    # Fetch segment details
    transcript = db.query(Transcript).filter(Transcript.meeting_id == meeting_id).first()
    segment = db.query(TranscriptSegment).filter(TranscriptSegment.transcript_id == transcript.id).first()
    assert segment is not None
    
    # 1. Edit segment text
    edit_payload = {"text": "Welcome to the school board meeting edited.", "speaker": "Speaker New"}
    edit_res = client.put(f"/api/transcripts/{meeting_id}/segments/{segment.id}", json=edit_payload)
    assert edit_res.status_code == 200
    
    # Validate DB update
    db.refresh(segment)
    assert segment.text == "Welcome to the school board meeting edited."
    assert segment.speaker == "Speaker New"

    # Verify Audit log
    audit = db.query(AuditLog).filter(AuditLog.action == "edit_transcript_segment").first()
    assert audit is not None
    assert "edited." in audit.details

    # Clean up physical file
    recording = db.query(Recording).filter(Recording.meeting_id == meeting_id).first()
    if recording and os.path.exists(recording.filepath):
        try:
            os.remove(recording.filepath)
        except Exception:
            pass
