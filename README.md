# Online Meeting Summarizer

**Case Study:** Starlight Secondary School, Amuria District, Uganda  
**Academic Project:** Kumi University

A production-oriented three-tier web application for scheduling, inviting participants, recording/uploading meetings, AI transcription, editable minutes, action-item tracking, official exports and operational administration.

## Production stack

| Layer | Technology |
|---|---|
| Frontend | Next.js, React, TypeScript, Tailwind CSS |
| Backend | FastAPI, SQLAlchemy, Alembic |
| Database | PostgreSQL 16 (SQLite fallback for local tests/dev) |
| Queue | Redis + Celery |
| Media | FFmpeg |
| AI transcription | Google Gemini Files API + Gemini model configured by `GEMINI_MODEL` |
| Minutes generation | Gemini structured output with deterministic TextRank fallback |
| Authentication | Argon2id + JWT cookies |
| Deployment | Docker Compose / Coolify |

Google Gemini is the single production transcription provider.

## Main features

- Administrator, Minute Secretary and Staff roles.
- Schedule meetings and invite participants by email.
- General meeting links for WhatsApp sharing.
- Public `/join/<code>` attendance registration with full name and title/position.
- Browser microphone recording or WAV/MP3/M4A/MP4/WebM/OGG upload.
- FFmpeg normalisation before Gemini transcription.
- Timestamped speaker turns with editable transcript and revision history.
- Editable minutes, key points, decisions and action items.
- Responsible person can be selected from known people or typed manually.
- Action-item filtering by status, priority, responsible person and deadline range.
- PDF, DOCX and TXT minutes; transcript appendix begins on a new page in PDF/DOCX.
- Starlight S.S official logo/branding in the application and exports.
- Notification indicator for completed/failed processing and open action items.
- System Settings showing actual Gemini/SMTP/database readiness.
- Validated database backup downloads, offline restore tooling and retention cleanup.
- Administrator audit activity view.

## Local development

### Prerequisites
- Python 3.12+
- Node.js 20+
- npm 10+
- FFmpeg
- Redis for Celery when exercising background jobs

```bash
git clone <repository-url> starlight-meeting-summarizer
cd starlight-meeting-summarizer
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

Administrators can create/download validated backups from **System Settings & Operations**. PostgreSQL uses `pg_dump` custom format. Restore is intentionally offline:

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

Academic project. All rights reserved.
