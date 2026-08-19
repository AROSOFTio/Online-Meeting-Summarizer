import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core import deps
from app.core.audit import log_action
from app.core.config import settings
from app.models.models import (
    ActionItem, AuditLog, BackupRecord, JobStatus, Meeting, MeetingStatus,
    Participant, ProcessingJob, Recording, SystemSetting, User, UserRole,
)
from app.services.backup import create_database_backup, validate_backup
from app.services.gemini_client import resolve_gemini_model
from app.services.email import email_service

router = APIRouter()


def _visible_meetings_query(db: Session, user: User):
    query = db.query(Meeting)
    if user.role == UserRole.admin:
        return query
    return query.filter(
        (Meeting.owner_id == user.id)
        | Meeting.participants.any(Participant.email == user.email)
    )


@router.get("/status")
def system_status(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    retention = db.query(SystemSetting).filter(SystemSetting.key == "retention_period_days").first()
    return {
        "transcription_provider": "Google Gemini",
        "gemini_model": resolve_gemini_model(),
        "gemini_configured": bool(settings.GEMINI_API_KEY),
        "smtp_configured": email_service.enabled,
        "database": "SQLite" if settings.is_sqlite else "PostgreSQL",
        "queue": "Redis + Celery",
        "timezone": settings.TIMEZONE,
        "retention_period_days": int(retention.value) if retention and retention.value.isdigit() else settings.RETENTION_PERIOD_DAYS,
    }


@router.get("/notifications")
def notifications(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    notices = []
    failed = _visible_meetings_query(db, current_user).filter(Meeting.status == MeetingStatus.failed).order_by(Meeting.updated_at.desc()).limit(5).all()
    for meeting in failed:
        notices.append({
            "type": "error", "title": "Meeting processing failed",
            "message": meeting.title, "href": f"/meetings/{meeting.id}",
            "created_at": meeting.updated_at.isoformat(),
        })

    recent_cutoff = datetime.now(timezone.utc) - timedelta(days=3)
    completed = _visible_meetings_query(db, current_user).filter(
        Meeting.status == MeetingStatus.completed,
        Meeting.updated_at >= recent_cutoff,
    ).order_by(Meeting.updated_at.desc()).limit(5).all()
    for meeting in completed:
        notices.append({
            "type": "success", "title": "Minutes ready",
            "message": meeting.title, "href": f"/meetings/{meeting.id}",
            "created_at": meeting.updated_at.isoformat(),
        })

    actions = db.query(ActionItem).filter(ActionItem.status != "completed")
    if current_user.role != UserRole.admin:
        actions = actions.join(Meeting).filter(
            ((Meeting.owner_id == current_user.id) | Meeting.participants.any(Participant.email == current_user.email))
            & (
                (ActionItem.assignee_id == current_user.id)
                | (func.lower(ActionItem.responsible_name) == current_user.full_name.lower())
            )
        )
    for item in actions.order_by(ActionItem.deadline.asc().nulls_last()).limit(5).all():
        notices.append({
            "type": "task", "title": "Action item",
            "message": item.description,
            "href": "/action-items", "created_at": item.updated_at.isoformat(),
            "deadline": str(item.deadline) if item.deadline else None,
        })

    notices.sort(key=lambda item: item.get("created_at") or "", reverse=True)
    return {"count": len(notices), "items": notices[:10]}


@router.get("/audit")
def audit_logs(
    limit: int = 50,
    action: Optional[str] = None,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_admin_user),
):
    limit = max(1, min(limit, 200))
    query = db.query(AuditLog)
    if action:
        query = query.filter(AuditLog.action.ilike(f"%{action}%"))
    rows = query.order_by(AuditLog.created_at.desc()).limit(limit).all()
    return [{
        "id": row.id, "user_email": row.user_email, "action": row.action,
        "details": row.details, "ip_address": row.ip_address,
        "created_at": row.created_at.isoformat(),
    } for row in rows]


@router.get("/backups")
def list_backups(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_admin_user),
):
    rows = db.query(BackupRecord).order_by(BackupRecord.created_at.desc()).limit(30).all()
    return [{
        "id": row.id,
        "filename": Path(row.filepath).name,
        "size_bytes": row.size_bytes,
        "status": row.status,
        "created_at": row.created_at.isoformat(),
    } for row in rows]


@router.post("/backups")
def create_backup(
    request: Request,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_admin_user),
):
    try:
        path = create_database_backup()
        validate_backup(path)
        record = BackupRecord(filepath=str(path), size_bytes=path.stat().st_size, status="validated")
        db.add(record)
        db.commit()
        db.refresh(record)
        log_action(db, action="create_backup", details=f"Created validated database backup {path.name}", user_id=current_user.id, user_email=current_user.email, ip_address=request.client.host if request.client else None)
        return {"id": record.id, "filename": path.name, "size_bytes": record.size_bytes, "status": record.status}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Backup failed: {exc}") from exc


@router.get("/backups/{backup_id}/download")
def download_backup(
    backup_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_admin_user),
):
    record = db.query(BackupRecord).filter(BackupRecord.id == backup_id).first()
    if not record or not os.path.isfile(record.filepath):
        raise HTTPException(status_code=404, detail="Backup file not found")
    validate_backup(Path(record.filepath))
    return FileResponse(record.filepath, filename=Path(record.filepath).name, media_type="application/octet-stream")


@router.post("/retention/cleanup")
def run_retention_cleanup(
    request: Request,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_admin_user),
):
    setting = db.query(SystemSetting).filter(SystemSetting.key == "retention_period_days").first()
    days = int(setting.value) if setting and setting.value.isdigit() else settings.RETENTION_PERIOD_DAYS
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    recordings = db.query(Recording).join(Meeting).filter(Meeting.is_archived.is_(True), Recording.created_at < cutoff).all()
    removed = 0
    for recording in recordings:
        if recording.filepath and os.path.isfile(recording.filepath):
            try:
                os.remove(recording.filepath)
            except OSError:
                continue
        db.delete(recording)
        removed += 1
    db.commit()
    log_action(db, action="retention_cleanup", details=f"Removed {removed} archived recording(s) older than {days} days", user_id=current_user.id, user_email=current_user.email, ip_address=request.client.host if request.client else None)
    return {"removed_recordings": removed, "retention_period_days": days}
