import math
import os
import struct
import wave
from datetime import datetime, timezone

import pytest

from app.models.models import AuditLog, JobStatus, Meeting, MeetingStatus, ProcessingJob, Recording, Transcript, TranscriptSegment
from app.workers.tasks import transcribe_meeting


def create_dummy_wav(path: str, duration: float = 2.0):
    sample_rate = 16000
    num_samples = int(duration * sample_rate)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        for i in range(num_samples):
            value = int(16384.0 * math.sin(2.0 * math.pi * 440.0 * i / sample_rate))
            wav.writeframesraw(struct.pack("<h", value))


@pytest.fixture(scope="function")
def speech_wav_fixture():
    fixture_path = "./tests/fixtures/speech.wav"
    create_dummy_wav(fixture_path, duration=1.5)
    yield fixture_path
    if os.path.exists(fixture_path):
        os.remove(fixture_path)


def login_admin(client):
    response = client.post("/api/auth/login", data={"username": "testadmin@starlight.sc.ug", "password": "TestAdminPass123!"})
    assert response.status_code == 200


def create_meeting(client, title: str):
    response = client.post("/api/meetings/", json={"title": title, "date": datetime.now(timezone.utc).isoformat(), "participants": []})
    assert response.status_code == 201
    return response.json()["id"]


def upload_wav(client, meeting_id: int, path: str):
    with open(path, "rb") as handle:
        response = client.post(f"/api/recordings/upload/{meeting_id}", files={"file": ("speech.wav", handle.read(), "audio/wav")})
    assert response.status_code == 200


def test_meeting_create_and_read(client, db):
    login_admin(client)
    payload = {
        "title": "Starlight Staff General Meeting",
        "description": "Discussing the term two layout plans and district reports.",
        "date": datetime.now(timezone.utc).isoformat(),
        "participants": [
            {"name": "Principal Okello", "email": "okello@starlight.sc.ug", "role_title": "Principal"},
            {"name": "Teacher Akello", "email": "akello@starlight.sc.ug", "role_title": "Academic Registrar"},
        ],
    }
    response = client.post("/api/meetings/", json=payload)
    assert response.status_code == 201
    meeting = response.json()
    assert meeting["title"] == payload["title"]
    assert len(meeting["participants"]) == 2
    read = client.get(f"/api/meetings/{meeting['id']}")
    assert read.status_code == 200
    assert read.json()["description"] == payload["description"]


def test_recording_upload_and_validation(client, db, speech_wav_fixture):
    login_admin(client)
    meeting_id = create_meeting(client, "Audio Upload Test Meeting")
    invalid = client.post(f"/api/recordings/upload/{meeting_id}", files={"file": ("bad_file.txt", b"dummy", "text/plain")})
    assert invalid.status_code == 400
    assert "Unsupported file extension" in invalid.json()["detail"]
    upload_wav(client, meeting_id, speech_wav_fixture)
    recording = db.query(Recording).filter(Recording.meeting_id == meeting_id).first()
    assert recording is not None
    assert os.path.exists(recording.filepath)
    os.remove(recording.filepath)


def test_transcription_pipeline(client, db, speech_wav_fixture, monkeypatch):
    monkeypatch.setenv("MOCK_TRANSCRIPTION", "true")
    login_admin(client)
    meeting_id = create_meeting(client, "Pipeline Test Meeting")
    upload_wav(client, meeting_id, speech_wav_fixture)
    response = client.post(f"/api/meetings/{meeting_id}/transcribe")
    assert response.status_code == 200
    job_id = response.json()["id"]
    transcribe_meeting(meeting_id, job_id)

    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
    transcript = db.query(Transcript).filter(Transcript.meeting_id == meeting_id).first()
    assert meeting.status == MeetingStatus.completed
    assert job.status == JobStatus.completed
    assert job.progress == 100
    assert transcript is not None
    assert "Welcome everyone to the Starlight Secondary School" in transcript.content
    segments = db.query(TranscriptSegment).filter(TranscriptSegment.transcript_id == transcript.id).all()
    assert segments and segments[0].speaker == "Speaker 1"
    recording = db.query(Recording).filter(Recording.meeting_id == meeting_id).first()
    if recording and os.path.exists(recording.filepath):
        os.remove(recording.filepath)


def test_transcript_segment_edit(client, db, speech_wav_fixture, monkeypatch):
    monkeypatch.setenv("MOCK_TRANSCRIPTION", "true")
    login_admin(client)
    meeting_id = create_meeting(client, "Segment Edit Test Meeting")
    upload_wav(client, meeting_id, speech_wav_fixture)
    response = client.post(f"/api/meetings/{meeting_id}/transcribe")
    transcribe_meeting(meeting_id, response.json()["id"])

    transcript = db.query(Transcript).filter(Transcript.meeting_id == meeting_id).first()
    segment = db.query(TranscriptSegment).filter(TranscriptSegment.transcript_id == transcript.id).first()
    edit = client.put(f"/api/transcripts/{meeting_id}/segments/{segment.id}", json={"text": "Welcome to the school board meeting edited.", "speaker": "Speaker New"})
    assert edit.status_code == 200
    db.refresh(segment)
    assert segment.text == "Welcome to the school board meeting edited."
    assert segment.speaker == "Speaker New"
    audit = db.query(AuditLog).filter(AuditLog.action == "edit_transcript_segment").first()
    assert audit is not None
    recording = db.query(Recording).filter(Recording.meeting_id == meeting_id).first()
    if recording and os.path.exists(recording.filepath):
        os.remove(recording.filepath)
