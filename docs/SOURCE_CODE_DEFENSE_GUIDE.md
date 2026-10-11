# Online Meeting Summarizer | Source-Code Defense Walkthrough

> Academic case study: Starlight Secondary School, Amuria District · Kumi University  
> Source: [AROSOFTio/Online-Meeting-Summarizer](https://github.com/AROSOFTio/Online-Meeting-Summarizer) · Branch: `main`

## 1. Project overview

The Online Meeting Summarizer schedules meetings, invites participants, records or accepts uploaded audio, transcribes speech, produces editable meeting minutes, tracks follow-up actions and exports reports.

**Flow:** Sign in → Create meeting → Invite / join → Record or upload → Prepare audio → Gemini transcription → Generate minutes → Review/edit → Export.

## 2. Technology stack

| Area | Technology |
|---|---|
| Frontend | Next.js, React, TypeScript, Tailwind CSS |
| Backend / API | Python, FastAPI |
| Database / ORM | PostgreSQL 16, SQLAlchemy, Alembic |
| Background jobs | Redis, Celery |
| Audio conversion | FFmpeg |
| Speech-to-text | Google Gemini Files API and configured Gemini model |
| Minutes | Gemini structured output with deterministic local fallback |
| Security | Argon2id password hashes, JWT-based sessions / cookies |
| Packaging | Docker, Docker Compose |
| Server provider | Hetzner (identified by project owner; not independently verified from code) |

## 3. Hosting and deployment

**Server:** Hetzner, as identified by the project owner. The source repository alone cannot establish the active server, operating system, IP address or container-management dashboard. **Coolify is not confirmed** and should not be claimed as a proven fact.

**Deployment defined by the code:** [`docker-compose.yml`](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/docker-compose.yml) contains five services:

| Service | Purpose | Internal port |
|---|---|---|
| `frontend` | Next.js user interface | 3000 |
| `backend` | FastAPI server | 8000 |
| `worker` | Celery transcription/minutes jobs | internal |
| `db` | PostgreSQL | internal |
| `redis` | Background-job message broker | internal |

**Request path:** Browser → Next.js frontend → `/api/*` rewrite to FastAPI → PostgreSQL / Celery → Redis → Gemini for AI jobs.

**Deployment and configuration files:** [`docker-compose.yml`](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/docker-compose.yml) · [`frontend/next.config.ts`](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/frontend/next.config.ts) · [`backend/Dockerfile`](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/backend/Dockerfile) · [`frontend/Dockerfile`](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/frontend/Dockerfile) · [`.env.example`](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/.env.example) · [`README.md`](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/README.md)

**Container deployment command:** `docker compose up --build -d`. Requires actual server environment variables and secrets configured privately. This is the repository's documented deployment method, not proof that the live server was deployed by that particular command.

**Application URL:** The example configuration names `https://starlightsecondaryschool.com` in `PUBLIC_APP_URL`. [Open configured domain](https://starlightsecondaryschool.com). **Live reachability and domain-to-server mapping were not verified**, so do not describe this as a confirmed working demo URL.

## 4. File-by-file code walkthrough

Open the following files in numbered order. Each link opens the actual GitHub source file.

| # | Feature | Source files | What happens |
|---|---|---|---|
| 1 | **Sign-in** | [page.tsx](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/frontend/src/app/login/page.tsx) · [auth.py](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/backend/app/api/endpoints/auth.py) | The login screen sends credentials to FastAPI, which authenticates the account. |
| 2 | **Dashboard** | [page.tsx](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/frontend/src/app/dashboard/page.tsx) · [stats.py](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/backend/app/api/endpoints/stats.py) | The dashboard displays the meeting and task overview. |
| 3 | **Create a meeting** | [page.tsx](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/frontend/src/app/meetings/new/page.tsx) · [meetings.py](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/backend/app/api/endpoints/meetings.py) | Meeting details are submitted and stored. |
| 4 | **Invite participants** | [page.tsx](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/frontend/src/app/meetings/[id]/invite/page.tsx) · [meetings.py](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/backend/app/api/endpoints/meetings.py) | Meeting invitations and share links are created. |
| 5 | **Attendance** | [page.tsx](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/frontend/src/app/join/[code]/page.tsx) · [attendance.py](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/backend/app/api/endpoints/attendance.py) | Participants join using an invitation code and register attendance. |
| 6 | **Start a live meeting** | [page.tsx](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/frontend/src/app/meetings/[id]/live/page.tsx) · [live_rooms.py](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/backend/app/api/endpoints/live_rooms.py) | The host starts and manages a live meeting. |
| 7 | **Capture microphone audio** | [AudioRecorder.tsx](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/frontend/src/components/AudioRecorder.tsx) | `getUserMedia()` requests microphone access; `MediaRecorder` captures audio chunks and supports pause, resume and stop. The live meeting screen also manages audio capture. |
| 8 | **Upload recording** | [page.tsx](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/frontend/src/app/meetings/[id]/live/page.tsx) · [recordings.py](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/backend/app/api/endpoints/recordings.py) | `POST /api/recordings/upload/{meeting_id}` transfers the recording to the server; recording metadata is saved. |
| 9 | **Start the processing job** | [meetings.py](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/backend/app/api/endpoints/meetings.py) · [tasks.py](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/backend/app/workers/tasks.py) | `POST /api/meetings/{meeting_id}/transcribe` creates and dispatches the processing job. |
| 10 | **Prepare audio** | [audio.py](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/backend/app/services/audio.py) · [tasks.py](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/backend/app/workers/tasks.py) | FFmpeg converts/normalises recorded audio for AI processing. |
| 11 | **Transcribe speech** | [transcription.py](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/backend/app/services/transcription.py) · [gemini_client.py](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/backend/app/services/gemini_client.py) | Gemini processes the audio and returns timestamped speech segments and speaker labels. |
| 12 | **Generate meeting minutes** | [gemini.py](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/backend/app/services/gemini.py) · [tasks.py](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/backend/app/workers/tasks.py) | Gemini generates a structured summary, key points, decisions and action items. The local summarizer supports a fallback for minutes. |
| 13 | **Save and edit transcript** | [transcripts.py](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/backend/app/api/endpoints/transcripts.py) · [page.tsx](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/frontend/src/app/meetings/[id]/page.tsx) | Transcript segments can be reviewed and edited; revision history is stored. |
| 14 | **Save and edit minutes** | [summaries.py](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/backend/app/api/endpoints/summaries.py) · [page.tsx](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/frontend/src/app/meetings/[id]/page.tsx) | Meeting summaries can be reviewed, updated and regenerated. |
| 15 | **Track follow-up tasks** | [action_items.py](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/backend/app/api/endpoints/action_items.py) · [page.tsx](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/frontend/src/app/action-items/page.tsx) | Action items have responsible people, statuses, priorities and dates. |
| 16 | **Export results** | [exports.py](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/backend/app/api/endpoints/exports.py) · [export.py](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/backend/app/services/export.py) | Minutes and transcript appendices can be exported as PDF/DOCX, with TXT available. |
| 17 | **Control access** | [security.py](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/backend/app/core/security.py) · [deps.py](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/backend/app/core/deps.py) | Password security, JWT authentication and role-based endpoint checks protect data. |
| 18 | **Database tables** | [models.py](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/backend/app/models/models.py) · [database.py](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/backend/app/core/database.py) | SQLAlchemy models define users, meetings, recordings, transcripts, summaries and jobs. |
| 19 | **Settings and operations** | [settings.py](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/backend/app/api/endpoints/settings.py) · [system.py](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/backend/app/api/endpoints/system.py) | Readiness checks, operations, backups and administrative controls. |

## 5. Exact recording-to-minutes code route

1. [`frontend/src/app/meetings/[id]/live/page.tsx`](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/frontend/src/app/meetings/[id]/live/page.tsx) handles the live host recording and sends recording data to the API.
2. [`frontend/src/components/AudioRecorder.tsx`](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/frontend/src/components/AudioRecorder.tsx) shows the reusable browser microphone recorder and its `MediaRecorder` implementation.
3. [`backend/app/api/endpoints/recordings.py`](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/backend/app/api/endpoints/recordings.py) receives the recording at `/api/recordings/upload/{meeting_id}` and saves its file and database record.
4. [`backend/app/api/endpoints/meetings.py`](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/backend/app/api/endpoints/meetings.py) starts transcription through `/api/meetings/{meeting_id}/transcribe`.
5. [`backend/app/workers/tasks.py`](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/backend/app/workers/tasks.py) runs the conversion, transcription, storage and minutes-generation stages.
6. [`backend/app/services/audio.py`](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/backend/app/services/audio.py) normalises the audio with FFmpeg.
7. [`backend/app/services/transcription.py`](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/backend/app/services/transcription.py) uploads audio to Gemini and parses the returned speaker segments.
8. [`backend/app/services/gemini.py`](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/backend/app/services/gemini.py) requests structured meeting minutes.
9. [`backend/app/models/models.py`](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/backend/app/models/models.py) defines the database records for the meeting, recording, transcript, summary and action items.
10. [`frontend/src/app/meetings/[id]/page.tsx`](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/frontend/src/app/meetings/[id]/page.tsx) displays completed transcription, minutes and action items for review.

## 6. Key defense answers

| Question | Short answer |
|---|---|
| Which language is the backend? | Python, using FastAPI. |
| Which languages build the frontend? | TypeScript/React with Next.js. |
| Where is meeting audio recorded? | In the user's browser through microphone APIs, then uploaded to the backend. |
| Does Python itself recognise speech? | No. The backend submits prepared audio to Google Gemini for transcription. |
| Why use FFmpeg? | To convert/normalise incoming audio before transcription. |
| Why Redis and Celery? | To handle time-consuming processing jobs outside the normal HTTP request. |
| Where are the results saved? | In PostgreSQL through SQLAlchemy models. Audio files are stored in server storage. |
| What happens if Gemini is unavailable? | Audio transcription requires a configured working Gemini API. Minutes generation has a local fallback for an existing transcript. |
| Can a user correct an AI transcript? | Yes, the app has transcript editing and revision support. |
| What is the hosting provider? | Hetzner, according to the project owner; server details must be demonstrated separately. |
| Is Coolify definitely installed? | Not confirmed. Docker Compose is present in the source code. |
| What is the live application address? | The template lists `starlightsecondaryschool.com`; live status is not confirmed. |

## 7. Demonstration sequence

Sign in → Create meeting → Share invite → Join as participant → Start meeting → Record short audio → End meeting → Processing → Transcript → Minutes → Actions → Export PDF.

**Technical checks:** [API health implementation](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/backend/app/api/endpoints/health.py) · [API router registration](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/backend/app/main.py) · [Automated tests](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/backend/tests) · [User manual](https://github.com/AROSOFTio/Online-Meeting-Summarizer/blob/main/docs/user_manual.md).

---
*Source-guided walkthrough. Deployment assertions and the live URL require confirmation on the actual Hetzner environment.*
