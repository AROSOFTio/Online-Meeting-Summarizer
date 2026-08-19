# Phase Status Tracking

## Phase 1: Foundation, Security and Data Model
**Status: Completed**

- Authentication and role enforcement
- PostgreSQL/SQLite data model and startup compatibility
- Staff administration
- Health checks and environment-based secrets

## Phase 2: Meetings, Recording and AI Transcription
**Status: Completed**

- Browser recording and supported media uploads
- FFmpeg conversion/normalisation
- Redis/Celery background processing
- Google Gemini transcription with timestamps/speaker turns
- Editable transcript and revision/audit trail
- Retry without duplicate meetings

## Phase 3: Minutes, Invitations, Actions and Exports
**Status: Completed**

- Gemini structured minutes with deterministic TextRank fallback
- Decisions and editable action items
- Responsible-person pick-or-type workflow
- Email invitations and WhatsApp/general meeting links
- Public attendance registration
- PDF/DOCX/TXT exports with official Starlight branding
- Separate transcript appendix page
- Meeting/action filters and workspace

## Phase 4: Hardening, Operations and Documentation
**Status: Completed**

- [x] Removed obsolete Whisper/Faster-Whisper configuration and UI
- [x] Settings shows actual Gemini model/key readiness rather than a fake local model selector
- [x] SMTP/database/queue readiness displayed to administrators
- [x] Notification indicator for completed/failed jobs and open tasks
- [x] Administrator audit activity view
- [x] Validated PostgreSQL/SQLite backup creation and download
- [x] Offline validated restore command
- [x] Recording retention cleanup restricted to archived meetings
- [x] Complete administrator/staff user manual
- [x] Requirements matrix aligned with current production architecture
- [x] PostgreSQL client tools included in the backend image for backup/restore
- [x] Tests updated/added for Settings and system operations

### Deployment verification
After each production deployment, perform the smoke-test sequence in `docs/user_manual.md`: login, create/invite meeting, public join, short media processing, transcript/minutes review, export, notification, backup and Settings status checks.
