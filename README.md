# ConveneCore

**Product:** ConveneCore — AI-powered meeting intelligence and action management  
**Academic Case Study:** Starlight Secondary School, Amuria District, Uganda  
**Academic Project:** Kumi University

ConveneCore is a production-oriented meeting management platform for organizations worldwide. It supports meeting scheduling and invitations, attendance, live/recorded meeting capture, AI transcription, configurable professional minutes, decisions, action tracking, official exports and operational administration.

Starlight Secondary School remains the academic case-study organization and bundled default configuration. It is **not hardcoded as the product identity**: administrators can configure their own organization name, logo, document terminology and minutes profile from Settings.

## Product identity vs organization identity

ConveneCore uses a two-layer branding model:

- **ConveneCore** is the software/product brand shown in the application shell, PWA metadata and sign-in experience.
- **Organization branding** is controlled by each deployment/workspace and is used in the workspace identity, invitations and official meeting records.

Administrators can configure:

- organization name, type, logo, address, phone, email, website, motto/tagline and registration/reference number;
- timezone and recording-retention policy;
- minutes document title and preferred language;
- default minutes style;
- custom labels for agenda, attendance, proceedings, decisions/resolutions, action items and transcript appendix.

Legacy `school_name` / `school_logo_*` settings remain compatible with the Starlight case-study deployment while `organization_*` is now the canonical worldwide naming.

## Minutes profiles

The initial global profiles are:

- Standard Professional
- Board / Governance
- Corporate / Management
- Project / Action-Oriented
- School / Academic
- NGO / Nonprofit
- Government / Public Sector

The selected profile and organization terminology are supplied to Gemini when generating minutes. PDF, DOCX and TXT exports use the configured organization identity, document title and section names rather than a fixed school-specific format.

## Production stack

| Layer | Technology |
|---|---|
| Frontend | Next.js, React, TypeScript, Tailwind CSS |
| Backend | FastAPI, SQLAlchemy, Alembic |
| Database | PostgreSQL 16 (SQLite fallback for local tests/dev) |
| Queue | Redis + Celery |
| Media | FFmpeg |
| AI transcription | Google Gemini Files API + model configured by `GEMINI_MODEL` |
| Minutes generation | Gemini structured output with deterministic TextRank fallback |
| Authentication | Argon2id + JWT cookies |
| Deployment | Docker Compose / Coolify |

Google Gemini is the single production transcription provider.

## Main features

- Administrator, Minute Secretary and Staff roles.
- Schedule meetings and invite participants by email.
- General meeting links for WhatsApp and other messaging channels.
- Public `/join/<code>` attendance registration with full name and title/position.
- Browser meeting capture and WAV/MP3/M4A/MP4/WebM/OGG upload.
- Live-room infrastructure for remote participation.
- FFmpeg normalisation before Gemini transcription.
- Timestamped speaker turns with editable transcript and revision history.
- Organization-aware AI minutes, key points, decisions and action items.
- Responsible person can be selected from known people or typed manually.
- Action-item filtering by status, priority, responsible person and deadline range.
- PDF, DOCX and TXT exports with organization-controlled branding and terminology.
- Transcript appendix starts on a new page in PDF/DOCX.
- Notification indicator for completed/failed processing and open action items.
- Settings showing actual Gemini/SMTP/database readiness.
- Validated database backup downloads, offline restore tooling and retention cleanup.
- Administrator audit activity view.

## Worldwide product direction

The core meeting record is designed to stay universal: attendance, agenda/topics, proceedings, decisions/resolutions, action items, responsibilities and deadlines. Presentation terminology can then vary by organization without changing the underlying facts.

Planned worldwide productization includes deeper researched minute profiles, richer localization, hybrid audio/video participation, organization onboarding and broader organization-level customization. ConveneCore should remain focused on the meeting lifecycle: **meet, decide, record and act** rather than becoming a general-purpose video-conferencing clone.

## Local development

### Prerequisites

- Python 3.12+
- Node.js 20+
- npm 10+
- FFmpeg
- Redis for Celery when exercising background jobs

```bash
git clone <repository-url> convenecore
cd convenecore
cp .env.example .env
```

Backend:

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Run verification:

```bash
cd backend
pytest

cd ../frontend
npm run lint
npx tsc --noEmit
npm run build
```

## Docker Compose / Coolify

```bash
cp .env.example .env
# Set real secrets/API/SMTP values before production use.
docker compose up --build
```

Compose services are `frontend`, `backend`, `worker`, `db` and `redis`. In Coolify the public domain should route to the frontend service on its internal port 3000; the frontend proxies `/api/*` to the backend internally.

## Important environment variables

- `DATABASE_URL`, `DB_PASSWORD`, `REDIS_URL`
- `SECRET_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`
- `PUBLIC_APP_URL`, `NEXT_PUBLIC_API_URL`, `TIMEZONE`
- `GEMINI_API_KEY`, `GEMINI_MODEL`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`

Never commit real production credentials.

## Backup and restore

Administrators can create/download validated backups from **Organization Settings & Operations**. PostgreSQL uses `pg_dump` custom format. Restore is intentionally offline:

```bash
cd backend
python scripts/restore_backup.py storage/backups/<backup-file> --yes
```

Stop backend and worker services before restoring production.

## Documentation

- `docs/user_manual.md` — administrator and staff user manual
- `REQUIREMENTS_TRACEABILITY.md` — implementation traceability
- `PHASE_STATUS.md` — development/hardening status

## API documentation

When the backend is running, OpenAPI docs are available at `/api/docs`.

## License

Academic project / product prototype. All rights reserved.
