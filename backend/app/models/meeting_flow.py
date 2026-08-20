from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.core.database import Base


class DirectoryProfile(Base):
    """Organisational directory metadata kept separate from system access roles."""

    __tablename__ = "directory_profiles"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    directory_group = Column(String(100), nullable=False, default="Staff", server_default="Staff", index=True)
    position_title = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    user = relationship("User")


class MeetingRuntime(Base):
    """Live meeting lifecycle without overloading the minutes-processing status enum."""

    __tablename__ = "meeting_runtimes"

    meeting_id = Column(Integer, ForeignKey("meetings.id", ondelete="CASCADE"), primary_key=True)
    lifecycle = Column(String(20), nullable=False, default="scheduled", server_default="scheduled", index=True)
    started_at = Column(DateTime, nullable=True)
    ended_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    meeting = relationship("Meeting")
