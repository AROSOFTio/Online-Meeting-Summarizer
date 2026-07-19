# Requirements Traceability Matrix

This document tracks all 35 functional requirements (FR) of the Online Meeting Summarizer, mapping each to its respective implementation components.

| Requirement ID | Description | Implementation File | API Endpoint | Database Entity | Automated Test | Status |
|---|---|---|---|---|---|---|
| **FR-01** | Secure login and logout | `backend/app/api/endpoints/auth.py`<br>`frontend/src/app/login/page.tsx` | `/api/auth/login`<br>`/api/auth/logout` | `User` | `backend/tests/test_auth.py` | Completed |
| **FR-02** | Server-enforced role-based access | `backend/app/core/deps.py` | N/A | `User` | `backend/tests/test_auth.py` | Completed |
| **FR-03** | Administrator staff account management | `backend/app/api/endpoints/staff.py`<br>`frontend/src/app/staff/page.tsx` | `/api/staff/*` | `User` | `backend/tests/test_staff.py` | Completed |
| **FR-04** | Create, update, archive and delete meetings | `backend/app/api/endpoints/meetings.py`<br>`frontend/src/app/meetings/page.tsx` | `/api/meetings/*` | `Meeting` | `backend/tests/test_meetings.py` | Completed |
| **FR-05** | Browser microphone recording with visible timer | `frontend/src/components/AudioRecorder.tsx` | N/A | N/A | N/A | Completed |
| **FR-06** | Pause, resume, stop, preview and discard recording | `frontend/src/components/AudioRecorder.tsx` | N/A | N/A | N/A | Completed |
| **FR-07** | Resumable or safely streamed media upload | `backend/app/api/endpoints/recordings.py` | `/api/recordings/upload` | `Recording` | `backend/tests/test_recordings.py` | Completed |
| **FR-08** | Support WAV, MP3, M4A, MP4, WebM and OGG | `backend/app/services/audio.py` | N/A | N/A | `backend/tests/test_recordings.py` | Completed |
| **FR-09** | Validate MIME type, extension, file size and duration | `backend/app/services/audio.py` | `/api/recordings/upload` | `Recording` | `backend/tests/test_recordings.py` | Completed |
| **FR-10** | Use FFmpeg to normalise media before transcription | `backend/app/services/audio.py` | N/A | N/A | `backend/tests/test_meetings.py` | Completed |
| **FR-11** | Real Faster-Whisper transcription with timestamps | `backend/app/services/transcription.py` | N/A | `Transcript`, `TranscriptSegment` | `backend/tests/test_meetings.py` | Completed |
| **FR-12** | Use Redis-backed background job for HTTP response | `backend/app/workers/tasks.py` | `/api/meetings/{id}/transcribe` | `ProcessingJob` | `backend/tests/test_meetings.py` | Completed |
| **FR-13** | Show queued, converting, transcribing, summarising, completed and failed progress | `backend/app/api/endpoints/meetings.py`<br>`frontend/src/app/meetings/new/page.tsx` | `/api/meetings/{id}/status` | `ProcessingJob` | `backend/tests/test_meetings.py` | Completed |
| **FR-14** | Permit retrying failed jobs without duplicating meeting | `backend/app/api/endpoints/meetings.py` | `/api/meetings/{id}/retry` | `ProcessingJob`, `Meeting` | `backend/tests/test_meetings.py` | Completed |
| **FR-15** | Provide near-real-time chunk processing where supported | `frontend/src/components/AudioRecorder.tsx`<br>`backend/app/api/endpoints/recordings.py` | `/api/recordings/upload/*` | N/A | `backend/tests/test_recordings.py` | Completed |
| **FR-16** | Provide an editable full transcript | `backend/app/api/endpoints/transcripts.py`<br>`frontend/src/app/meetings/[id]/page.tsx` | `/api/transcripts/{id}` | `Transcript` | `backend/tests/test_meetings.py` | Completed |
| **FR-17** | Preserve transcript revisions and record editor in audit log | `backend/app/api/endpoints/transcripts.py` | `/api/transcripts/{id}` | `TranscriptRevision`, `AuditLog` | `backend/tests/test_meetings.py` | Completed |
| **FR-18** | Generate extractive TextRank summary | `backend/app/services/summarizer.py` | N/A | `Summary` | Pending | Pending |
| **FR-19** | Generate structured key points, decisions and actions | `backend/app/services/summarizer.py` | N/A | `Decision`, `ActionItem` | Pending | Pending |
| **FR-20** | Never invent a decision, participant, deadline or action item | `backend/app/services/summarizer.py` | N/A | N/A | Pending | Pending |
| **FR-21** | Allow manual correction of all generated content | `backend/app/api/endpoints/summaries.py` | `/api/summaries/{id}` | `Summary`, `Decision`, `ActionItem` | Pending | Pending |
| **FR-22** | Assign action items to staff, add priority, deadline, status | `backend/app/api/endpoints/action_items.py` | `/api/action-items/*` | `ActionItem` | Pending | Pending |
| **FR-23** | Provide meeting search by title, owner, participant, date, transcript text | `backend/app/api/endpoints/meetings.py` | `/api/meetings/` | `Meeting`, `Transcript` | `backend/tests/test_meetings.py` | Completed |
| **FR-24** | Filter action items by assignee, status, priority, deadline | `backend/app/api/endpoints/action_items.py` | `/api/action-items/search` | `ActionItem` | Pending | Pending |
| **FR-25** | Export professional minutes to PDF, DOCX and TXT | `backend/app/services/export.py` | `/api/meetings/{id}/export` | `Export` | Pending | Pending |
| **FR-26** | Preserve recording, transcript, summary, decisions, actions, exports | `backend/app/models/models.py` | N/A | All entities | `backend/tests/test_meetings.py` | Completed |
| **FR-27** | Provide dashboard statistics calculated from database | `backend/app/api/endpoints/stats.py`<br>`frontend/src/app/dashboard/page.tsx` | `/api/stats` | All entities | `backend/tests/test_health.py` | Completed |
| **FR-28** | Provide audit logs for security-sensitive and content-changing operations | `backend/app/core/audit.py`<br>`backend/app/api/endpoints/audit.py` | `/api/audit` | `AuditLog` | `backend/tests/test_staff.py` | Completed |
| **FR-29** | Provide backup and restoration scripts with validation | `backend/app/services/backup.py` | N/A | `BackupRecord` | Pending | Pending |
| **FR-30** | Configurable school name, logo, timezone, retention, Whisper model | `backend/app/api/endpoints/settings.py` | `/api/settings` | `SystemSetting` | `backend/tests/test_settings.py` | Completed |
| **FR-31** | Provide private authorized download endpoints | `backend/app/api/endpoints/recordings.py` | `/api/recordings/{id}/download` | `Recording` | `backend/tests/test_meetings.py` | Completed |
| **FR-32** | Provide helpful error messages and recovery actions | `frontend/src/components/DashboardLayout.tsx` | N/A | N/A | N/A | Completed |
| **FR-33** | Provide notification indicators for completed jobs and assigned tasks | `backend/app/api/endpoints/notifications.py` | `/api/notifications` | N/A | Pending | Pending |
| **FR-34** | Support local network deployment | `docker-compose.yml` | N/A | N/A | N/A | Completed |
| **FR-35** | Provide complete administrator and staff user manual | `docs/user_manual.md` | N/A | N/A | N/A | Pending |
