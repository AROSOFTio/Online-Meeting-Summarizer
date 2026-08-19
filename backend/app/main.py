from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.endpoints import action_items, auth, exports, health, meetings, recordings, settings as settings_router, staff, stats, summaries, transcripts
from app.core.config import settings
from app.core.database import Base, SessionLocal, engine
from app.core.security import get_password_hash
from app.models.models import User, UserRole


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)

    if not settings.is_sqlite:
        with engine.begin() as connection:
            if connection.execute(text("SELECT to_regtype('userrole') IS NOT NULL")).scalar():
                connection.execute(text("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'minute_secretary'"))
            if connection.execute(text("SELECT to_regclass('public.meeting_participants') IS NOT NULL")).scalar():
                connection.execute(text(
                    "ALTER TABLE meeting_participants ADD COLUMN IF NOT EXISTS "
                    "attendance_status VARCHAR(20) NOT NULL DEFAULT 'present'"
                ))
            if connection.execute(text("SELECT to_regclass('public.action_items') IS NOT NULL")).scalar():
                connection.execute(text(
                    "ALTER TABLE action_items ADD COLUMN IF NOT EXISTS "
                    "responsible_name VARCHAR(255)"
                ))

    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.email == settings.ADMIN_EMAIL).first()
        if not admin:
            db.add(User(
                email=settings.ADMIN_EMAIL,
                hashed_password=get_password_hash(settings.ADMIN_PASSWORD),
                full_name="Starlight Administrator",
                role=UserRole.admin,
                is_active=True,
            ))
            db.commit()
            print(f"Seeded default administrator: {settings.ADMIN_EMAIL}")
    finally:
        db.close()
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url="/api/openapi.json",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.PUBLIC_APP_URL, "http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(staff.router, prefix="/api/staff", tags=["Staff Management"])
app.include_router(settings_router.router, prefix="/api/settings", tags=["Settings"])
app.include_router(health.router, prefix="/api/health", tags=["Health Check"])
app.include_router(stats.router, prefix="/api/stats", tags=["Statistics"])
app.include_router(meetings.router, prefix="/api/meetings", tags=["Meetings"])
app.include_router(recordings.router, prefix="/api/recordings", tags=["Recordings"])
app.include_router(transcripts.router, prefix="/api/transcripts", tags=["Transcripts"])
app.include_router(summaries.router, prefix="/api/summaries", tags=["Summaries"])
app.include_router(action_items.router, prefix="/api/action-items", tags=["Action Items"])
app.include_router(exports.router, prefix="/api/meetings", tags=["Exports"])
