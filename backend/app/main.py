from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.core.config import settings
from app.core.database import Base, engine, SessionLocal
from sqlalchemy import text
from app.models.models import User, UserRole
from app.core.security import get_password_hash
from app.api.endpoints import auth, staff, settings as settings_router, health, stats, meetings, recordings, transcripts, summaries, action_items, exports

@asynccontextmanager
async def lifespan(app: FastAPI):
    if not settings.is_sqlite:
        with engine.begin() as connection:
            connection.execute(text("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'minute_secretary'"))
            connection.execute(text(
                "ALTER TABLE meeting_participants ADD COLUMN IF NOT EXISTS "
                "attendance_status VARCHAR(20) NOT NULL DEFAULT 'present'"
            ))
    # Ensure the schema exists before querying or seeding application data.
    Base.metadata.create_all(bind=engine)
        
    # Seed default administrator account if database is empty
    db = SessionLocal()
    try:
        admin_email = settings.ADMIN_EMAIL
        admin = db.query(User).filter(User.email == admin_email).first()
        if not admin:
            hashed_pwd = get_password_hash(settings.ADMIN_PASSWORD)
            new_admin = User(
                email=admin_email,
                hashed_password=hashed_pwd,
                full_name="Starlight Administrator",
                role=UserRole.admin,
                is_active=True
            )
            db.add(new_admin)
            db.commit()
            print(f"Seeded default administrator: {admin_email}")
    finally:
        db.close()
    yield
    # Shutdown actions (if any)

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url="/api/openapi.json",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan
)

# CORS Middleware configurations
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount endpoints
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
