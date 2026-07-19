from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime, date
from app.models.models import UserRole, MeetingStatus, JobStatus

# Token schemas
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenPayload(BaseModel):
    sub: Optional[str] = None

# User schemas
class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: UserRole
    is_active: bool = True

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None

class UserOut(UserBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# Settings schemas
class SettingItem(BaseModel):
    key: str
    value: str

    class Config:
        from_attributes = True

class SettingUpdate(BaseModel):
    value: str

# Audit Log Schema
class AuditLogOut(BaseModel):
    id: int
    user_id: Optional[int]
    user_email: Optional[str]
    action: str
    details: Optional[str]
    ip_address: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True

# Participant schemas
class ParticipantBase(BaseModel):
    name: str
    email: Optional[str] = None
    role_title: Optional[str] = None

class ParticipantCreate(ParticipantBase):
    pass

class ParticipantOut(ParticipantBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

# Meeting schemas
class MeetingBase(BaseModel):
    title: str
    description: Optional[str] = None
    date: datetime

class MeetingCreate(MeetingBase):
    participants: List[ParticipantCreate] = []

class MeetingUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    date: Optional[datetime] = None
    is_archived: Optional[bool] = None
    status: Optional[MeetingStatus] = None

class MeetingOut(MeetingBase):
    id: int
    owner_id: int
    status: MeetingStatus
    is_archived: bool
    created_at: datetime
    updated_at: datetime
    participants: List[ParticipantOut] = []

    class Config:
        from_attributes = True

# Processing Job schema
class ProcessingJobOut(BaseModel):
    id: str
    meeting_id: int
    status: JobStatus
    error_message: Optional[str] = None
    progress: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
