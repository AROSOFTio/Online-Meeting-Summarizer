from sqlalchemy import Column, Integer, ForeignKey, Text, String
from app.core.database import Base


class MinuteFormat(Base):
    __tablename__ = "minute_formats"
    id = Column(Integer, primary_key=True)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    definition = Column(Text, nullable=False)


class MeetingMinuteFormat(Base):
    __tablename__ = "meeting_minute_formats"
    meeting_id = Column(Integer, ForeignKey("meetings.id", ondelete="CASCADE"), primary_key=True)
    definition = Column(Text, nullable=False)
    values_json = Column(Text, nullable=False, default="{}")
    status = Column(String(20), nullable=False, default="draft")
