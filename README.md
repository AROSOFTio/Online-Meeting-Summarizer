# Online Meeting Summarizer

**Case Study:** Starlight Secondary School, Amuria District, Uganda  
**Kumi University — Undergraduate Academic Project**

A three-tier client-server web application for recording, transcribing, summarising and managing school meeting minutes. Built with Next.js, FastAPI, PostgreSQL, Redis, Faster-Whisper and TextRank.

---

## Quick Start (Local Development — No Docker)

### Prerequisites

- Python 3.12+
- Node.js 20+
- npm 10+
- FFmpeg (optional for Phase 1; required for transcription in Phase 2+)

### 1. Clone and configure

```bash
git clone <repository-url> startlight
cd startlight
cp .env.example .env
```

### 2. Backend setup

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate

# Linux/macOS
source .venv/bin/activate

pip install -r requirements.txt
```

### 3. Start the backend

```bash
cd backend
.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
```

The API will seed a default administrator on first startup:
- **Email:** `admin@starlight.sc.ug`
- **Password:** `Starlight2026!`

API documentation: http://localhost:8000/api/docs

### 4. Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000 and log in with the administrator credentials above.

### 5. Run tests

```bash
# Backend
cd backend
.venv\Scripts\python -m pytest

# Frontend
cd frontend
npm run lint
npx tsc --noEmit
```

---

## Docker Compose (Full Stack)

```bash
cp .env.example .env
# Edit .env to set SECRET_KEY and DB_PASSWORD
docker compose up --build
```

Services:
| Service  | Port | Description               |
|----------|------|---------------------------|
| frontend | 3000 | Next.js web application   |
| backend  | 8000 | FastAPI REST API           |
| db       | 5432 | PostgreSQL 16              |
| redis    | 6379 | Redis 7 (Celery broker)    |
| worker   | —    | Celery background worker   |

---

## Project Structure

```
startlight/
├── backend/              # Python FastAPI application
│   ├── app/
│   │   ├── api/endpoints/ # REST endpoints
│   │   ├── core/          # Config, security, database, audit
│   │   ├── models/        # SQLAlchemy ORM models
│   │   ├── schemas/       # Pydantic request/response schemas
│   │   └── workers/       # Celery background tasks
│   ├── migrations/        # Alembic database migrations
│   ├── tests/             # Pytest test suites
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/             # Next.js TypeScript application
│   ├── src/
│   │   ├── app/           # App Router pages
│   │   ├── components/    # Shared UI components
│   │   ├── context/       # React contexts (Auth)
│   │   └── lib/           # API client utilities
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
├── PHASE_STATUS.md
├── REQUIREMENTS_TRACEABILITY.md
└── README.md
```

---

## Default Administrator

On first startup the system creates an administrator account using environment variables:

| Variable       | Default                  |
|---------------|--------------------------|
| ADMIN_EMAIL    | admin@starlight.sc.ug    |
| ADMIN_PASSWORD | Starlight2026!           |

**Change these in production.**

---

## Technology Stack

| Layer         | Technology                                  |
|--------------|---------------------------------------------|
| Frontend     | Next.js, TypeScript, Tailwind CSS, Recharts |
| Backend      | FastAPI, SQLAlchemy 2, Alembic              |
| Database     | PostgreSQL 16 (SQLite fallback for dev)     |
| Queue        | Redis + Celery                              |
| Transcription| Faster-Whisper + FFmpeg                     |
| Summarisation| TextRank (networkx + scikit-learn)           |
| Auth         | Argon2id + JWT cookies                      |
| Testing      | Pytest, Vitest, Playwright                  |

---

## License

This project is an academic submission for Kumi University. All rights reserved.
