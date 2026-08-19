# Requirements Traceability Matrix

This matrix reflects the current production architecture. The retired Faster-Whisper references have been removed; Google Gemini is the production transcription provider.

| ID | Requirement | Main implementation | Verification | Status |
|---|---|---|---|---|
| FR-01 | Secure login/logout | `api/endpoints/auth.py`, login UI | `test_auth.py` | Completed |
| FR-02 | Server-enforced roles | `core/deps.py` | `test_auth.py` | Completed |
| FR-03 | Administrator staff management | `api/endpoints/staff.py`, Staff UI | `test_staff.py` | Completed |
| FR-04 | Create/update/archive/delete meetings | `api/endpoints/meetings.py`, Meetings UI | `test_meetings.py` | Completed |
| FR-05 | Browser microphone recording with timer | `components/AudioRecorder.tsx` | UI flow | Completed |
| FR-06 | Pause/resume/stop/preview/discard | `components/AudioRecorder.tsx` | UI flow | Completed |
| FR-07 | Safely streamed media upload | `api/endpoints/recordings.py` | `test_meetings.py` | Completed |
| FR-08 | WAV/MP3/M4A/MP4/WebM/OGG | `services/audio.py` | recording tests | Completed |
| FR-09 | Validate type/extension/size/duration | `services/audio.py`, recordings endpoint | recording tests | Completed |
| FR-10 | FFmpeg normalisation | `services/audio.py` | meeting tests | Completed |
| FR-11 | Real AI transcription with timestamps | `services/transcription.py`, Gemini Files API | meeting tests + production pipeline | Completed |
| FR-12 | Redis/Celery background jobs | `workers/tasks.py` | meeting tests | Completed |
| FR-13 | Processing progress states | meetings status API, new-meeting UI | meeting tests | Completed |
| FR-14 | Retry failed job without duplicate meeting | meetings retry API/UI | meeting tests | Completed |
| FR-15 | Non-blocking upload/processing workflow | recordings API + Celery pipeline | meeting tests | Completed |
| FR-16 | Editable transcript | transcripts API + meeting workspace | meeting tests | Completed |
| FR-17 | Transcript revisions/audit | transcripts API, `TranscriptRevision`, `AuditLog` | meeting tests | Completed |
| FR-18 | Deterministic extractive fallback summary | `services/summarizer.py` | `test_summaries.py` | Completed |
| FR-19 | Structured key points/decisions/actions | `services/gemini.py`, summarizer fallback | `test_summaries.py` | Completed |
| FR-20 | Avoid invented decisions/participants/deadlines | constrained Gemini prompt/schema + deterministic fallback | summary tests/manual review | Completed |
| FR-21 | Manual correction of generated content | summaries/transcripts/action-items APIs + workspace | `test_summaries.py` | Completed |
| FR-22 | Assignee/responsible, priority, deadline, status | action-items API/UI | `test_summaries.py` | Completed |
| FR-23 | Meeting search | meetings API/directory | `test_meetings.py` | Completed |
| FR-24 | Action filters by assignee/responsible/status/priority/deadline | `api/endpoints/action_items.py`, Action Items UI | API/UI flow | Completed |
| FR-25 | PDF/DOCX/TXT official exports | `services/export.py`, exports endpoint | `test_summaries.py` | Completed |
| FR-26 | Preserve meeting records and generated artifacts | ORM models/storage | meeting tests | Completed |
| FR-27 | Database-backed dashboard statistics | stats API/dashboard | health/stats flow | Completed |
| FR-28 | Security/content audit logs with admin visibility | `core/audit.py`, `/api/system/audit`, Settings UI | `test_system.py` | Completed |
| FR-29 | Validated backup + restore tooling | `services/backup.py`, `/api/system/backups`, `scripts/restore_backup.py` | `test_system.py` + validation commands | Completed |
| FR-30 | Configurable school branding/timezone/retention + actual AI status | settings API/UI + `/api/system/status` | `test_settings.py` | Completed |
| FR-31 | Private authorised recording/backup download | recordings/system endpoints | meeting/system tests | Completed |
| FR-32 | Helpful errors and recovery actions | processing UI, retry flow, Settings readiness cards | UI flow | Completed |
| FR-33 | Notification indicator for jobs/tasks | `/api/system/notifications`, `NotificationCenter.tsx` | `test_system.py` | Completed |
| FR-34 | Local/container deployment | `docker-compose.yml`, Dockerfiles | deployment flow | Completed |
| FR-35 | Administrator/staff user manual | `docs/user_manual.md` | documentation review | Completed |

## Production AI note

The application no longer exposes or uses a Whisper model setting. `GEMINI_API_KEY` and `GEMINI_MODEL` are deployment environment variables. The Settings page displays the effective provider/model and readiness without pretending an obsolete local model selector controls production.
