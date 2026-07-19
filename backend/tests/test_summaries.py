"""
test_summaries.py
=================
Phase 3 Automated Tests — TextRank, exports, summaries API, action items API.

All tests run against an in-memory SQLite database via the shared conftest.py
fixtures. No network calls, no LLMs, no mocks.
"""
import io
import os
import pytest

# conftest.py already sets TESTING=true and DATABASE_URL before any import

from app.services.summarizer import (
    summarize,
    extract_decisions,
    extract_action_items,
    extract_key_points,
    _split_sentences,
)


# ─────────────────────────────────────────────────────────────────────────────
# 1.  TextRank summarizer unit tests
# ─────────────────────────────────────────────────────────────────────────────

SAMPLE_TEXT = (
    "The board resolved to increase the annual budget by ten percent. "
    "The committee agreed that all staff must attend the safety training by Friday. "
    "The headmaster will coordinate with the district education office next week. "
    "Pupils are required to submit project proposals before the end of term. "
    "The school board decided to purchase ten new computers for the library. "
    "The deputy headmistress shall organise the inter-school sports event. "
    "Teachers were advised to update their lesson plans accordingly. "
    "The meeting concluded after all agenda items were exhausted. "
    "Minutes of the previous meeting were confirmed as a true record. "
    "Any other business was deferred to the next meeting scheduled for August."
)


class TestSummarizer:
    def test_summarize_returns_non_empty_text(self):
        result = summarize(SAMPLE_TEXT, sentence_count=3)
        assert isinstance(result, str)
        assert len(result.strip()) > 0

    def test_summarize_does_not_invent_content(self):
        """Every word in the summary must come from the original text."""
        result = summarize(SAMPLE_TEXT, sentence_count=3)
        result_words = set(result.lower().split())
        source_words = set(SAMPLE_TEXT.lower().split())
        # Allow punctuation-stripped matches
        result_clean = {w.strip(".,;:!?\"'") for w in result_words}
        source_clean = {w.strip(".,;:!?\"'") for w in source_words}
        assert result_clean.issubset(source_clean), (
            f"Summary contains invented words: {result_clean - source_clean}"
        )

    def test_summarize_returns_fewer_sentences_than_input(self):
        n = 3
        result = summarize(SAMPLE_TEXT, sentence_count=n)
        output_sentences = _split_sentences(result)
        assert len(output_sentences) <= n

    def test_summarize_empty_input(self):
        assert summarize("") == ""
        assert summarize("   ") == ""

    def test_summarize_short_text_returned_as_is(self):
        short = "The board agreed to adjourn the meeting."
        result = summarize(short, sentence_count=5)
        assert short.strip() in result

    def test_extract_decisions_finds_decision_language(self):
        decisions = extract_decisions(SAMPLE_TEXT)
        assert len(decisions) > 0
        for d in decisions:
            has_keyword = any(
                kw in d.lower()
                for kw in ("resolved", "agreed", "decided", "concluded", "confirmed", "advised")
            )
            assert has_keyword, f"Decision '{d}' does not contain a decision keyword"

    def test_extract_decisions_no_fabrication(self):
        decisions = extract_decisions(SAMPLE_TEXT)
        for d in decisions:
            assert d in SAMPLE_TEXT, f"Fabricated decision: {d}"

    def test_extract_action_items_finds_action_language(self):
        items = extract_action_items(SAMPLE_TEXT)
        assert len(items) > 0
        for item in items:
            assert "text" in item
            assert len(item["text"]) > 10

    def test_extract_action_items_deadline_extraction(self):
        text_with_deadline = (
            "The teacher will submit the report by 30 July 2025. "
            "The secretary shall prepare the agenda before the meeting."
        )
        items = extract_action_items(text_with_deadline)
        deadline_items = [i for i in items if i.get("raw_deadline")]
        assert len(deadline_items) >= 1

    def test_extract_key_points_returns_list(self):
        kps = extract_key_points(SAMPLE_TEXT, count=4)
        assert isinstance(kps, list)
        assert len(kps) <= 4
        for kp in kps:
            assert isinstance(kp, str) and len(kp) > 0


# ─────────────────────────────────────────────────────────────────────────────
# 2.  Export service unit tests
# ─────────────────────────────────────────────────────────────────────────────

class TestExportService:
    EXPORT_ARGS = dict(
        meeting_title="Term 2 Staff Meeting",
        meeting_date="2025-07-15",
        participants=["Mr. Okello", "Ms. Atim"],
        summary_text="The staff resolved to implement new attendance registers.",
        decisions=["Attendance registers to be updated by Friday."],
        action_items=[
            {"text": "Update registers", "assignee_name": "Mr. Okello",
             "deadline": "2025-07-18", "status": "pending", "priority": "high"}
        ],
        transcript_text="The headmaster opened the meeting and welcomed all staff."
    )

    def test_export_txt_returns_bytes(self):
        from app.services.export import export_txt
        result = export_txt(**self.EXPORT_ARGS)
        assert isinstance(result, bytes)
        assert len(result) > 0

    def test_export_txt_contains_title(self):
        from app.services.export import export_txt
        result = export_txt(**self.EXPORT_ARGS).decode("utf-8")
        assert "Term 2 Staff Meeting" in result

    def test_export_txt_contains_decisions(self):
        from app.services.export import export_txt
        result = export_txt(**self.EXPORT_ARGS).decode("utf-8")
        assert "Attendance registers" in result

    def test_export_txt_contains_action_items(self):
        from app.services.export import export_txt
        result = export_txt(**self.EXPORT_ARGS).decode("utf-8")
        assert "Mr. Okello" in result

    def test_export_pdf_returns_bytes(self):
        from app.services.export import export_pdf
        result = export_pdf(**self.EXPORT_ARGS)
        assert isinstance(result, bytes)
        # PDF magic bytes
        assert result[:4] == b"%PDF"

    def test_export_pdf_is_non_trivial_size(self):
        from app.services.export import export_pdf
        result = export_pdf(**self.EXPORT_ARGS)
        assert len(result) > 2000  # Real PDF, not empty shell

    def test_export_docx_returns_bytes(self):
        from app.services.export import export_docx
        result = export_docx(**self.EXPORT_ARGS)
        assert isinstance(result, bytes)
        # DOCX magic bytes (zip archive)
        assert result[:2] == b"PK"

    def test_export_docx_contains_title(self):
        from app.services.export import export_docx
        from docx import Document
        result = export_docx(**self.EXPORT_ARGS)
        doc = Document(io.BytesIO(result))
        full_text = " ".join(p.text for p in doc.paragraphs)
        assert "Term 2 Staff Meeting" in full_text


# ─────────────────────────────────────────────────────────────────────────────
# 3.  Summaries API integration tests
# ─────────────────────────────────────────────────────────────────────────────

class TestSummariesAPI:
    def _create_completed_meeting(self, client):
        """Helper: create + complete a meeting with a transcript in test DB."""
        # Login as admin (created by lifespan) — use OAuth2 form
        login = client.post("/api/auth/login", data={
            "username": os.environ["ADMIN_EMAIL"],
            "password": os.environ["ADMIN_PASSWORD"]
        })
        assert login.status_code == 200, f"Login failed: {login.json()}"
        token = login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Create meeting
        meeting_res = client.post("/api/meetings/", headers=headers, json={
            "title": "Test Meeting for Summary",
            "date": "2025-07-15",
            "description": "A test meeting"
        })
        assert meeting_res.status_code == 201
        meeting_id = meeting_res.json()["id"]

        # Manually insert transcript + mark as completed via DB
        from app.models.models import Meeting, Transcript, MeetingStatus
        from app.core.database import SessionLocal
        db = SessionLocal()
        try:
            meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
            meeting.status = MeetingStatus.completed
            transcript = Transcript(meeting_id=meeting_id, content=SAMPLE_TEXT)
            db.add(transcript)
            db.commit()
        finally:
            db.close()

        return meeting_id, headers

    def test_generate_summary_creates_record(self, client):
        meeting_id, headers = self._create_completed_meeting(client)
        res = client.post(f"/api/summaries/{meeting_id}/generate", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert "summary_id" in data
        assert len(data["text"]) > 0

    def test_get_summary_returns_data(self, client):
        meeting_id, headers = self._create_completed_meeting(client)
        client.post(f"/api/summaries/{meeting_id}/generate", headers=headers)
        res = client.get(f"/api/summaries/{meeting_id}", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert data["text"]
        assert isinstance(data["key_points"], list)
        assert isinstance(data["decisions"], list)

    def test_update_summary_changes_text(self, client):
        meeting_id, headers = self._create_completed_meeting(client)
        client.post(f"/api/summaries/{meeting_id}/generate", headers=headers)
        new_text = "Manually corrected summary text."
        res = client.put(
            f"/api/summaries/{meeting_id}",
            headers=headers,
            json={"text": new_text}
        )
        assert res.status_code == 200
        # Verify change persisted
        get_res = client.get(f"/api/summaries/{meeting_id}", headers=headers)
        assert get_res.json()["text"] == new_text

    def test_add_and_delete_decision(self, client):
        meeting_id, headers = self._create_completed_meeting(client)
        client.post(f"/api/summaries/{meeting_id}/generate", headers=headers)
        # Add
        add_res = client.post(
            f"/api/summaries/{meeting_id}/decisions",
            headers=headers,
            json={"text": "A manually added decision."}
        )
        assert add_res.status_code == 200
        decision_id = add_res.json()["id"]
        # Delete
        del_res = client.delete(
            f"/api/summaries/{meeting_id}/decisions/{decision_id}",
            headers=headers
        )
        assert del_res.status_code == 200

    def test_get_summary_requires_auth(self, client):
        res = client.get("/api/summaries/9999")
        assert res.status_code == 401

    def test_get_summary_404_when_none(self, client):
        login = client.post("/api/auth/login", data={
            "username": os.environ["ADMIN_EMAIL"],
            "password": os.environ["ADMIN_PASSWORD"]
        })
        assert login.status_code == 200, f"Login failed: {login.json()}"
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
        res = client.get("/api/summaries/9999", headers=headers)
        assert res.status_code == 404


# ─────────────────────────────────────────────────────────────────────────────
# 4.  Action Items API integration tests
# ─────────────────────────────────────────────────────────────────────────────

class TestActionItemsAPI:
    def _login(self, client):
        res = client.post("/api/auth/login", data={
            "username": os.environ["ADMIN_EMAIL"],
            "password": os.environ["ADMIN_PASSWORD"]
        })
        assert res.status_code == 200, f"Login failed: {res.json()}"
        return {"Authorization": f"Bearer {res.json()['access_token']}"}

    def _create_meeting(self, client, headers):
        res = client.post("/api/meetings/", headers=headers, json={
            "title": "Action Items Test Meeting",
            "date": "2025-07-16"
        })
        return res.json()["id"]

    def test_create_action_item(self, client):
        headers = self._login(client)
        meeting_id = self._create_meeting(client, headers)
        res = client.post("/api/action-items/", headers=headers, json={
            "meeting_id": meeting_id,
            "text": "Prepare quarterly budget report",
            "priority": "high",
            "status": "pending"
        })
        assert res.status_code == 200
        assert res.json()["text"] == "Prepare quarterly budget report"

    def test_list_action_items(self, client):
        headers = self._login(client)
        meeting_id = self._create_meeting(client, headers)
        client.post("/api/action-items/", headers=headers, json={
            "meeting_id": meeting_id, "text": "Task 1"
        })
        client.post("/api/action-items/", headers=headers, json={
            "meeting_id": meeting_id, "text": "Task 2"
        })
        res = client.get(f"/api/action-items/?meeting_id={meeting_id}", headers=headers)
        assert res.status_code == 200
        assert len(res.json()) == 2

    def test_update_action_item_status(self, client):
        headers = self._login(client)
        meeting_id = self._create_meeting(client, headers)
        create_res = client.post("/api/action-items/", headers=headers, json={
            "meeting_id": meeting_id, "text": "Complete lab preparation"
        })
        item_id = create_res.json()["id"]
        update_res = client.put(
            f"/api/action-items/{item_id}",
            headers=headers,
            json={"status": "in_progress"}
        )
        assert update_res.status_code == 200
        assert update_res.json()["status"] == "in_progress"

    def test_delete_action_item(self, client):
        headers = self._login(client)
        meeting_id = self._create_meeting(client, headers)
        create_res = client.post("/api/action-items/", headers=headers, json={
            "meeting_id": meeting_id, "text": "Temporary task"
        })
        item_id = create_res.json()["id"]
        del_res = client.delete(f"/api/action-items/{item_id}", headers=headers)
        assert del_res.status_code == 200
        # Verify gone
        list_res = client.get(f"/api/action-items/?meeting_id={meeting_id}", headers=headers)
        ids = [i["id"] for i in list_res.json()]
        assert item_id not in ids

    def test_action_items_require_auth(self, client):
        res = client.get("/api/action-items/")
        assert res.status_code == 401

    def test_invalid_deadline_format_returns_400(self, client):
        headers = self._login(client)
        meeting_id = self._create_meeting(client, headers)
        res = client.post("/api/action-items/", headers=headers, json={
            "meeting_id": meeting_id,
            "text": "Task with bad date",
            "deadline": "not-a-date"
        })
        assert res.status_code == 400
