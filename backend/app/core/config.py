from pathlib import Path
from secrets import token_urlsafe
from typing import Optional

from pydantic import EmailStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "ConveneCore"
    SECRET_KEY: str = token_urlsafe(48)
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24
    PUBLIC_APP_URL: str = "http://localhost:3000"

    DATABASE_URL: str = "sqlite:///./meeting_summarizer.db"
    REDIS_URL: str = "redis://localhost:6379/0"

    ADMIN_EMAIL: EmailStr = "admin@example.com"
    ADMIN_PASSWORD: str = ""

    SCHOOL_NAME: str = "ConveneCore"
    SCHOOL_LOGO_URL: str = "/api/settings/logo"
    TIMEZONE: str = "Africa/Kampala"
    RETENTION_PERIOD_DAYS: int = 365

    # Gemini is the single production transcription/summarisation provider.
    GEMINI_API_KEY: Optional[str] = None
    GEMINI_MODEL: str = "gemini-3.6-flash"

    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 465
    SMTP_USERNAME: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_FROM_EMAIL: EmailStr = "notifications@example.com"
    SMTP_USE_SSL: bool = True
    SMTP_USE_STARTTLS: bool = False
    SMTP_VERIFY_TLS: bool = True

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
        if v.startswith("postgres://"):
            return v.replace("postgres://", "postgresql://", 1)
        return v

    @field_validator("PUBLIC_APP_URL", mode="before")
    @classmethod
    def normalise_public_url(cls, v: Optional[str]) -> str:
        return (v or "http://localhost:3000").rstrip("/")

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
Path(settings.STORAGE_DIR).mkdir(parents=True, exist_ok=True)
Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
Path(settings.EXPORT_DIR).mkdir(parents=True, exist_ok=True)
