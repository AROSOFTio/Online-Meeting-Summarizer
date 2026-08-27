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
- Email invitations and shareable meeting links
- Public attendance registration
- PDF/DOCX/TXT exports with configurable organization branding
- Separate transcript appendix page
- Meeting/action filters and workspace

## Phase 4: Hardening, Operations and Documentation
**Status: Completed**

- [x] Removed retired local transcription-provider configuration and UI
- [x] Settings shows actual Gemini model/key readiness rather than a misleading local model selector
- [x] SMTP/database/queue readiness displayed to administrators
- [x] Notification indicator for completed/failed jobs and open tasks
- [x] Administrator audit activity view
- [x] Validated PostgreSQL/SQLite backup creation and download
- [x] Offline validated restore command
- [x] Recording retention cleanup restricted to archived meetings
- [x] Administrator/staff user manual
- [x] Requirements matrix aligned with current production architecture
- [x] PostgreSQL client tools included in the backend image for backup/restore
- [x] Tests updated/added for Settings and system operations
- [x] GitHub Actions backend/frontend verification workflow

## Phase 5: ConveneCore Global Productization
**Status: In progress**

### Completed in the current branding/globalization pass
- [x] ConveneCore product identity separated from customer organization identity
- [x] ConveneCore product mark/wordmark and PWA/application branding
- [x] Generic `organization_*` settings with migration compatibility for the Starlight case study
- [x] Configurable organization name, type, logo, contacts, motto and reference number
- [x] Configurable minutes document title, language, style and section terminology
- [x] Organization-aware Gemini minutes generation
- [x] Organization-aware PDF/DOCX/TXT exports
- [x] Organization-aware invitation/completion/final-minutes email branding
- [x] Organization branding on public join and meeting-room surfaces
- [x] Starlight Secondary School retained only as the bundled academic case-study/default organization

### Remaining worldwide product work
- [ ] Research and validate minute profiles across corporate, board/governance, NGO/nonprofit, academic, government and project-management contexts
- [ ] Convert initial minutes styles from prompt guidance into richer profile-specific structures where evidence supports differences
- [ ] Localization: translated UI, locale-aware dates/numbers and broader language testing
- [ ] Runtime workspace timezone throughout scheduling and notifications (current deployment still has environment-level timezone behavior in some backend paths)
- [ ] Hybrid video participation with camera optional and remote audio captured reliably for transcription
- [ ] Action carry-forward / matters arising and stronger cross-meeting follow-up
- [ ] True multi-tenant SaaS architecture for many organizations in one hosted instance: Organization/Workspace entity, tenant-scoped users/settings/meetings and authorization
- [ ] Organization onboarding, subscription/billing and workspace administration for hosted commercial use

### Scope note
The current implementation supports **organization-configurable branding and minutes behavior for a deployment/workspace**. It does not yet claim that one running deployment safely hosts many unrelated organizations as isolated tenants. That requires the multi-tenant work listed above.

### Deployment verification
After each production deployment, perform the smoke-test sequence in `docs/user_manual.md`: login, verify ConveneCore + organization branding, create/invite meeting, public join, short media processing, transcript/minutes review, configurable export, notification, backup and Settings status checks.
