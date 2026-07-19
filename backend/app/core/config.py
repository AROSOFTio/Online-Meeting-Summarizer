from pathlib import Path
from typing import Optional
from pydantic import EmailStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # App Settings
    PROJECT_NAME: str = "Online Meeting Summarizer"
    SECRET_KEY: str = "supersecretkeydefaultforstarlightsecondaryschool2026!"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day

    # Database & Redis Settings
    DATABASE_URL: str = "sqlite:///./meeting_summarizer.db"
    REDIS_URL: str = "redis://localhost:6379/0"

    # Default Administrator Seeding Credentials
    ADMIN_EMAIL: EmailStr = "admin@starlight.sc.ug"
    ADMIN_PASSWORD: str = "Starlight2026!"

    # School & System Settings Defaults
    SCHOOL_NAME: str = "Starlight Secondary School"
    SCHOOL_LOGO_URL: str = "/images/logo.png"
    TIMEZONE: str = "Africa/Kampala"
    RETENTION_PERIOD_DAYS: int = 365
    WHISPER_MODEL: str = "base"

    # Storage Paths
    STORAGE_DIR: str = "storage"
    UPLOAD_DIR: str = "storage/recordings"
    EXPORT_DIR: str = "storage/exports"

    @property
    def is_sqlite(self) -> bool:
        return self.DATABASE_URL.startswith("sqlite")

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def assemble_db_connection(cls, v: Optional[str]) -> str:
        if not v:
            return "sqlite:///./meeting_summarizer.db"
        # SQLAlchemy 2.0 requires postgresql:// instead of postgres://
        if v.startswith("postgres://"):
            return v.replace("postgres://", "postgresql://", 1)
        return v

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()

# Ensure directories exist
Path(settings.STORAGE_DIR).mkdir(parents=True, exist_ok=True)
Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
Path(settings.EXPORT_DIR).mkdir(parents=True, exist_ok=True)
