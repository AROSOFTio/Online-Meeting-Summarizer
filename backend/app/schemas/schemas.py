from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field

from app.models.models import JobStatus, MeetingStatus, UserRole


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenPayload(BaseModel):
    sub: Optional[str] = None


class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: UserRole
    is_active: bool = True
    directory_group: str = "Staff"
    position_title: Optional[str] = None


class UserCreate(UserBase):
    password: Optional[str] = None


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None
    directory_group: Optional[str] = None
    position_title: Optional[str] = None


class UserOut(UserBase):
    must_change_password: bool = False
    id: int
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True


class SettingItem(BaseModel):
    key: str
    value: str
    class Config:
        from_attributes = True


class SettingUpdate(BaseModel):
    value: str


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


class ParticipantBase(BaseModel):
    name: str
    email: Optional[str] = None
    role_title: Optional[str] = None
    attendance_status: str = "present"


class ParticipantCreate(ParticipantBase):
    pass


class ParticipantOut(ParticipantBase):
    id: int
    created_at: datetime
    class Config:
        from_attributes = True


class RecordingOut(BaseModel):
    id: int
    meeting_id: int
    filename: str
    duration_seconds: Optional[float] = None
    file_size_bytes: Optional[int] = None
    mime_type: Optional[str] = None
    created_at: datetime
    class Config:
        from_attributes = True


class MeetingBase(BaseModel):
    title: str
    description: Optional[str] = None
    date: datetime


class MeetingCreate(MeetingBase):
    participants: List[ParticipantCreate] = Field(default_factory=list)


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
    participants: List[ParticipantOut] = Field(default_factory=list)
    recording: Optional[RecordingOut] = None
    class Config:
        from_attributes = True


class InvitationCreate(BaseModel):
    user_ids: List[int] = Field(default_factory=list)
    emails: List[EmailStr] = Field(default_factory=list)
    send_email: bool = True


class InvitationJoin(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=255)


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


class SummaryOut(BaseModel):
    id: int
    meeting_id: int
    text: str
    key_points: List[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True


class SummaryUpdate(BaseModel):
    text: Optional[str] = None
    key_points: Optional[List[str]] = None


class DecisionOut(BaseModel):
    id: int
    meeting_id: int
    text: str
    created_at: datetime
    class Config:
        from_attributes = True


class DecisionCreate(BaseModel):
    text: str


class ActionItemBase(BaseModel):
    text: str
    assignee_id: Optional[int] = None
    responsible_name: Optional[str] = None
    priority: Optional[str] = "medium"
    deadline: Optional[str] = None
    status: Optional[str] = "pending"


class ActionItemCreate(ActionItemBase):
    meeting_id: int


class ActionItemUpdate(BaseModel):
    text: Optional[str] = None
    assignee_id: Optional[int] = None
    responsible_name: Optional[str] = None
    priority: Optional[str] = None
    deadline: Optional[str] = None
    status: Optional[str] = None


class ActionItemOut(ActionItemBase):
    id: int
    meeting_id: int
    assignee_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True
