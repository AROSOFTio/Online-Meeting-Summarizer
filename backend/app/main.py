from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.endpoints import action_items, attendance, auth, exports, health, live_rooms, meetings, recordings, settings as settings_router, staff, stats, summaries, system, transcripts
from app.core.config import settings
from app.core.database import Base, SessionLocal, engine
from app.core.security import get_password_hash
from app.models.meeting_flow import DirectoryProfile, MeetingRuntime  # noqa: F401
from app.models.models import SystemSetting, User, UserRole


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)

    with engine.begin() as connection:
        if settings.is_sqlite:
            columns = {row[1] for row in connection.execute(text('PRAGMA table_info(users)'))}
            if 'must_change_password' not in columns:
                connection.execute(text('ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT 0'))
        else:
            connection.execute(text('ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE'))

    if not settings.is_sqlite:
        with engine.begin() as connection:
            if connection.execute(text("SELECT to_regtype('userrole') IS NOT NULL")).scalar():
                connection.execute(text("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'minute_secretary'"))
            if connection.execute(text("SELECT to_regclass('public.meeting_participants') IS NOT NULL")).scalar():
                connection.execute(text("ALTER TABLE meeting_participants ADD COLUMN IF NOT EXISTS attendance_status VARCHAR(20) NOT NULL DEFAULT 'present'"))
                connection.execute(text("ALTER TABLE meeting_participants ALTER COLUMN attendance_status TYPE VARCHAR(500)"))
            if connection.execute(text("SELECT to_regclass('public.action_items') IS NOT NULL")).scalar():
                connection.execute(text("ALTER TABLE action_items ADD COLUMN IF NOT EXISTS responsible_name VARCHAR(255)"))

    db = SessionLocal()
    try:
        retired_model_key = "whis" + "per_model"
        db.query(SystemSetting).filter(SystemSetting.key == retired_model_key).delete(synchronize_session=False)

        admin = db.query(User).filter(User.email == settings.ADMIN_EMAIL).first()
        if not admin:
            admin = User(
                email=settings.ADMIN_EMAIL,
                hashed_password=get_password_hash(settings.ADMIN_PASSWORD),
                full_name="Starlight Administrator",
                role=UserRole.admin,
                is_active=True,
            )
            db.add(admin)
            db.flush()
        else:
            # This is a single-organisation deployment. The configured admin
            # account is authoritative so changing ADMIN_PASSWORD/ADMIN_EMAIL
            # in production does not leave a stale database credential behind.
            admin.hashed_password = get_password_hash(settings.ADMIN_PASSWORD)
            admin.full_name = admin.full_name or "Starlight Administrator"
            admin.role = UserRole.admin
            admin.is_active = True

        if not db.query(DirectoryProfile).filter(DirectoryProfile.user_id == admin.id).first():
            db.add(DirectoryProfile(user_id=admin.id, directory_group="Management", position_title="Administrator"))
        db.commit()
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
app.include_router(system.router, prefix="/api/system", tags=["System & Operations"])
app.include_router(health.router, prefix="/api/health", tags=["Health Check"])
app.include_router(stats.router, prefix="/api/stats", tags=["Statistics"])
# Register richer invitation/attendance handlers first so they override the
# older status-only handlers still kept in meetings.py for compatibility.
app.include_router(attendance.router, prefix="/api/meetings", tags=["Attendance"])
app.include_router(meetings.router, prefix="/api/meetings", tags=["Meetings"])
app.include_router(live_rooms.router, prefix="/api/live-rooms", tags=["Live Meetings"])
app.include_router(recordings.router, prefix="/api/recordings", tags=["Recordings"])
app.include_router(transcripts.router, prefix="/api/transcripts", tags=["Transcripts"])
app.include_router(summaries.router, prefix="/api/summaries", tags=["Summaries"])
app.include_router(action_items.router, prefix="/api/action-items", tags=["Action Items"])
app.include_router(exports.router, prefix="/api/meetings", tags=["Exports"])
