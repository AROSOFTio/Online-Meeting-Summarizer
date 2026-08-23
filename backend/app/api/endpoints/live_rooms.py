import secrets
import threading
import time
import uuid
from dataclasses import dataclass
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from jose import JWTError, jwt
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core import deps
from app.core.config import settings
from app.models.meeting_flow import DirectoryProfile, MeetingRuntime
from app.models.models import (
    Meeting,
    MeetingInvitation,
    MeetingStatus,
    Participant,
    User,
    UserRole,
    meeting_participants,
)

router = APIRouter()

STALE_PEER_SECONDS = 35.0
ALLOWED_SIGNAL_TYPES = {"offer", "answer", "ice"}


@dataclass
class LivePeer:
    peer_id: str
    session_key: str
    name: str
    role_title: str
    user_id: Optional[int]
    is_moderator: bool
    muted: bool
    forced_muted: bool
    joined_at: float
    last_seen: float


class JoinLiveRoom(BaseModel):
    invite_code: Optional[str] = None
    full_name: Optional[str] = None


class Heartbeat(BaseModel):
    peer_id: str
    session_key: str
    muted: bool = False


class SignalMessage(BaseModel):
    peer_id: str
    session_key: str
    target_id: str
    type: str
    payload: Optional[dict[str, Any]] = None


class ModerateRequest(BaseModel):
    peer_id: str
    session_key: str
    target_id: str
    action: str = Field(pattern="^(mute|release)$")


class LeaveRequest(BaseModel):
    peer_id: str
    session_key: str


_LOCK = threading.RLock()
_ROOMS: dict[int, dict[str, LivePeer]] = {}
_SIGNALS: dict[int, dict[str, list[dict[str, Any]]]] = {}


def _runtime_for(meeting: Meeting, db: Session) -> MeetingRuntime:
    runtime = db.query(MeetingRuntime).filter(MeetingRuntime.meeting_id == meeting.id).first()
    if runtime:
        return runtime
    lifecycle = (
        "ended"
        if meeting.status in {MeetingStatus.processing, MeetingStatus.completed, MeetingStatus.failed}
        else "scheduled"
    )
    runtime = MeetingRuntime(meeting_id=meeting.id, lifecycle=lifecycle)
    db.add(runtime)
    db.flush()
    return runtime


def _optional_user(request: Request, db: Session) -> Optional[User]:
    token = request.cookies.get("session_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1].strip()
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email = payload.get("sub")
        if not email:
            return None
    except JWTError:
        return None
    return (
        db.query(User)
        .filter(func.lower(User.email) == str(email).strip().lower(), User.is_active.is_(True))
        .first()
    )


def _profile_for(db: Session, user: User) -> Optional[DirectoryProfile]:
    return db.query(DirectoryProfile).filter(DirectoryProfile.user_id == user.id).first()


def _moderator_for(meeting: Meeting, user: Optional[User]) -> bool:
    return bool(user and (user.role == UserRole.admin or meeting.owner_id == user.id))


def _participant_by_email(db: Session, email: str) -> Optional[Participant]:
    return db.query(Participant).filter(func.lower(Participant.email) == email.strip().lower()).first()


def _participant_by_name_for_meeting(db: Session, meeting: Meeting, name: str) -> Optional[Participant]:
    normalized = name.strip().lower()
    return next(
        (participant for participant in meeting.participants if participant.name.strip().lower() == normalized),
        None,
    )


def _link_present(meeting: Meeting, participant: Participant, db: Session) -> None:
    existing = db.execute(
        meeting_participants.select().where(
            meeting_participants.c.meeting_id == meeting.id,
            meeting_participants.c.participant_id == participant.id,
        )
    ).mappings().first()
    if not existing:
        meeting.participants.append(participant)
        db.flush()
    db.execute(
        meeting_participants.update()
        .where(
            meeting_participants.c.meeting_id == meeting.id,
            meeting_participants.c.participant_id == participant.id,
        )
        .values(attendance_status="present")
    )


def _register_authenticated_participant(meeting: Meeting, user: User, db: Session) -> tuple[str, str]:
    profile = _profile_for(db, user)
    role_title = (
        (profile.position_title if profile else None)
        or (profile.directory_group if profile else None)
        or ("Administrator" if user.role == UserRole.admin else "Staff")
    )
    participant = _participant_by_email(db, user.email)
    if not participant:
        participant = Participant(name=user.full_name, email=user.email.lower(), role_title=role_title)
        db.add(participant)
        db.flush()
    else:
        participant.name = user.full_name
        participant.role_title = role_title
    _link_present(meeting, participant, db)
    return user.full_name, role_title


def _register_invited_participant(
    meeting: Meeting,
    invitation: MeetingInvitation,
    requested_name: Optional[str],
    db: Session,
) -> tuple[str, str, Optional[int]]:
    known_user = None
    if invitation.email:
        known_user = (
            db.query(User)
            .filter(
                func.lower(User.email) == invitation.email.strip().lower(),
                User.is_active.is_(True),
            )
            .first()
        )
    if known_user:
        name, role_title = _register_authenticated_participant(meeting, known_user, db)
        invitation.status = "joined"
        return name, role_title, known_user.id

    email = invitation.email.strip().lower() if invitation.email else None
    participant = _participant_by_email(db, email) if email else None
    name = (requested_name or "").strip()
    if not name and participant:
        name = participant.name.strip()
    if len(name) < 2:
        raise HTTPException(status_code=400, detail="Please enter your full name before joining the meeting microphone")
    if not participant:
        participant = _participant_by_name_for_meeting(db, meeting, name)
    if not participant:
        participant = Participant(name=name, email=email, role_title="Guest")
        db.add(participant)
        db.flush()
    else:
        participant.name = name
        if email and not participant.email:
            participant.email = email
        if not participant.role_title or participant.role_title == "Invited guest":
            participant.role_title = "Guest"
    _link_present(meeting, participant, db)
    invitation.status = "joined"
    return participant.name, participant.role_title or "Guest", None


def _signals_for(meeting_id: int, peer_id: str) -> list[dict[str, Any]]:
    return _SIGNALS.setdefault(meeting_id, {}).setdefault(peer_id, [])


def _enqueue(meeting_id: int, target_id: str, message: dict[str, Any]) -> None:
    _signals_for(meeting_id, target_id).append(message)


def _remove_peer_locked(meeting_id: int, peer_id: str) -> None:
    room = _ROOMS.get(meeting_id, {})
    if peer_id not in room:
        return
    room.pop(peer_id, None)
    _SIGNALS.get(meeting_id, {}).pop(peer_id, None)
    for other_id in list(room):
        _enqueue(
            meeting_id,
            other_id,
            {"type": "peer-left", "from_peer_id": peer_id, "payload": None},
        )
    if not room:
        _ROOMS.pop(meeting_id, None)
        _SIGNALS.pop(meeting_id, None)


def _cleanup_stale_locked(meeting_id: int) -> None:
    now = time.monotonic()
    room = _ROOMS.get(meeting_id, {})
    stale_ids = [
        peer_id
        for peer_id, peer in room.items()
        if now - peer.last_seen > STALE_PEER_SECONDS
    ]
    for peer_id in stale_ids:
        _remove_peer_locked(meeting_id, peer_id)


def _peer_locked(meeting_id: int, peer_id: str, session_key: str) -> LivePeer:
    _cleanup_stale_locked(meeting_id)
    peer = _ROOMS.get(meeting_id, {}).get(peer_id)
    if not peer or not secrets.compare_digest(peer.session_key, session_key):
        raise HTTPException(status_code=401, detail="Live meeting session expired. Rejoin the meeting.")
    peer.last_seen = time.monotonic()
    return peer


def _serialize_peers(meeting_id: int, self_id: Optional[str] = None) -> list[dict[str, Any]]:
    room = _ROOMS.get(meeting_id, {})
    return [
        {
            "peer_id": peer.peer_id,
            "name": peer.name,
            "role_title": peer.role_title,
            "user_id": peer.user_id,
            "is_moderator": peer.is_moderator,
            "muted": peer.muted,
            "forced_muted": peer.forced_muted,
            "is_self": peer.peer_id == self_id,
        }
        for peer in sorted(room.values(), key=lambda item: (not item.is_moderator, item.joined_at))
    ]


@router.get("/ongoing")
def ongoing_meetings(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    rows = (
        db.query(Meeting, MeetingRuntime)
        .join(MeetingRuntime, MeetingRuntime.meeting_id == Meeting.id)
        .filter(
            MeetingRuntime.lifecycle == "live",
            Meeting.is_archived.is_(False),
        )
        .order_by(MeetingRuntime.started_at.desc(), Meeting.date.desc())
        .all()
    )
    return [
        {
            "id": meeting.id,
            "title": meeting.title,
            "description": meeting.description,
            "date": meeting.date,
            "owner_id": meeting.owner_id,
            "owner_name": meeting.owner.full_name if meeting.owner else "Meeting organiser",
            "status": meeting.status.value,
            "lifecycle": runtime.lifecycle,
            "started_at": runtime.started_at,
            "participants": [
                {
                    "id": participant.id,
                    "name": participant.name,
                    "email": participant.email,
                    "role_title": participant.role_title,
                }
                for participant in meeting.participants
            ],
            "is_moderator": _moderator_for(meeting, current_user),
        }
        for meeting, runtime in rows
    ]


@router.get("/{meeting_id}/info")
def live_meeting_info(
    meeting_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id, Meeting.is_archived.is_(False)).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    runtime = _runtime_for(meeting, db)
    is_moderator = _moderator_for(meeting, current_user)
    if not is_moderator and runtime.lifecycle != "live":
        raise HTTPException(status_code=403, detail="This meeting is not currently live")
    db.commit()
    return {
        "id": meeting.id,
        "title": meeting.title,
        "description": meeting.description,
        "date": meeting.date,
        "owner_id": meeting.owner_id,
        "owner_name": meeting.owner.full_name if meeting.owner else "Meeting organiser",
        "status": meeting.status.value,
        "lifecycle": runtime.lifecycle,
        "started_at": runtime.started_at,
        "ended_at": runtime.ended_at,
        "is_moderator": is_moderator,
        "recording": (
            {
                "id": meeting.recording.id,
                "filename": meeting.recording.filename,
            }
            if meeting.recording
            else None
        ),
    }


@router.post("/{meeting_id}/join")
def join_live_room(
    meeting_id: int,
    body: JoinLiveRoom,
    request: Request,
    db: Session = Depends(deps.get_db),
):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id, Meeting.is_archived.is_(False)).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    runtime = _runtime_for(meeting, db)
    if runtime.lifecycle != "live":
        raise HTTPException(status_code=409, detail="The organiser has not started this meeting yet")

    user = _optional_user(request, db)
    is_moderator = _moderator_for(meeting, user)
    if user:
        name, role_title = _register_authenticated_participant(meeting, user, db)
        user_id = user.id
    else:
        invite_code = (body.invite_code or "").strip().upper()
        invitation = (
            db.query(MeetingInvitation)
            .filter(
                MeetingInvitation.meeting_id == meeting.id,
                MeetingInvitation.code == invite_code,
            )
            .first()
        )
        if not invitation:
            raise HTTPException(status_code=401, detail="A valid meeting invitation is required")
        name, role_title, user_id = _register_invited_participant(
            meeting,
            invitation,
            body.full_name,
            db,
        )
    db.commit()

    peer_id = uuid.uuid4().hex
    session_key = secrets.token_urlsafe(32)
    now = time.monotonic()
    peer = LivePeer(
        peer_id=peer_id,
        session_key=session_key,
        name=name,
        role_title=role_title,
        user_id=user_id,
        is_moderator=is_moderator,
        muted=False,
        forced_muted=False,
        joined_at=time.time(),
        last_seen=now,
    )
    with _LOCK:
        _cleanup_stale_locked(meeting_id)
        _ROOMS.setdefault(meeting_id, {})[peer_id] = peer
        _signals_for(meeting_id, peer_id)
        participants = _serialize_peers(meeting_id, peer_id)
    return {
        "meeting_id": meeting.id,
        "peer_id": peer_id,
        "session_key": session_key,
        "is_moderator": is_moderator,
        "participants": participants,
    }


@router.post("/{meeting_id}/heartbeat")
def heartbeat(meeting_id: int, body: Heartbeat):
    with _LOCK:
        peer = _peer_locked(meeting_id, body.peer_id, body.session_key)
        peer.muted = True if peer.forced_muted else body.muted
        return {
            "participants": _serialize_peers(meeting_id, body.peer_id),
            "forced_muted": peer.forced_muted,
        }


@router.post("/{meeting_id}/signal")
def send_signal(meeting_id: int, body: SignalMessage):
    if body.type not in ALLOWED_SIGNAL_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported live meeting signal")
    with _LOCK:
        _peer_locked(meeting_id, body.peer_id, body.session_key)
        target = _ROOMS.get(meeting_id, {}).get(body.target_id)
        if not target:
            return {"delivered": False}
        _enqueue(
            meeting_id,
            body.target_id,
            {
                "type": body.type,
                "from_peer_id": body.peer_id,
                "payload": body.payload,
            },
        )
    return {"delivered": True}


@router.get("/{meeting_id}/signals")
def receive_signals(
    meeting_id: int,
    peer_id: str = Query(min_length=1),
    session_key: str = Query(min_length=1),
):
    with _LOCK:
        _peer_locked(meeting_id, peer_id, session_key)
        queue = _signals_for(meeting_id, peer_id)
        messages = list(queue)
        queue.clear()
    return {"messages": messages}


@router.post("/{meeting_id}/moderate")
def moderate_live_room(meeting_id: int, body: ModerateRequest):
    with _LOCK:
        actor = _peer_locked(meeting_id, body.peer_id, body.session_key)
        if not actor.is_moderator:
            raise HTTPException(status_code=403, detail="Only the meeting organiser or owner can control participant microphones")
        room = _ROOMS.get(meeting_id, {})
        if body.target_id == "*":
            targets = [peer for peer in room.values() if peer.peer_id != actor.peer_id]
        else:
            target = room.get(body.target_id)
            if not target:
                raise HTTPException(status_code=404, detail="Participant is no longer connected")
            if target.peer_id == actor.peer_id:
                raise HTTPException(status_code=400, detail="Use your own microphone control for your microphone")
            targets = [target]

        for target in targets:
            if body.action == "mute":
                target.forced_muted = True
                target.muted = True
                _enqueue(
                    meeting_id,
                    target.peer_id,
                    {
                        "type": "force-mute",
                        "from_peer_id": actor.peer_id,
                        "payload": {"reason": "Microphone turned off by meeting organiser"},
                    },
                )
            else:
                target.forced_muted = False
                target.muted = False
                _enqueue(
                    meeting_id,
                    target.peer_id,
                    {
                        "type": "release-mute",
                        "from_peer_id": actor.peer_id,
                        "payload": {"reason": "Microphone turned on by meeting organiser"},
                    },
                )
        participants = _serialize_peers(meeting_id, actor.peer_id)
    return {"participants": participants}


@router.post("/{meeting_id}/leave")
def leave_live_room(meeting_id: int, body: LeaveRequest):
    with _LOCK:
        _peer_locked(meeting_id, body.peer_id, body.session_key)
        _remove_peer_locked(meeting_id, body.peer_id)
    return {"detail": "Left live meeting"}