from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timezone, timedelta

from app.core import deps
from app.models.models import User, Meeting, ActionItem, Recording, ProcessingJob, UserRole, ActionItemStatus

router = APIRouter()

@router.get("/")
@router.get("")
def get_dashboard_stats(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Retrieve database metrics for dashboards (No mocks)"""
    # Base computations from DB
    total_meetings = db.query(Meeting).count()
    
    # Meetings this month
    start_of_month = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    meetings_this_month = db.query(Meeting).filter(Meeting.date >= start_of_month).count()
    
    # Recorded hours (sum of recording durations)
    total_seconds = db.query(func.sum(Recording.duration_seconds)).scalar() or 0.0
    recorded_hours = round(total_seconds / 3600.0, 2)
    
    # Active staff count
    active_staff = db.query(User).filter(User.role == UserRole.staff, User.is_active == True).count()
    
    # Storage usage bytes
    storage_bytes = db.query(func.sum(Recording.file_size_bytes)).scalar() or 0
    storage_mb = round(storage_bytes / (1024 * 1024), 2)
    
    # Job states
    pending_jobs = db.query(ProcessingJob).filter(ProcessingJob.status.in_(["queued", "converting", "transcribing", "summarising"])).count()
    failed_jobs = db.query(ProcessingJob).filter(ProcessingJob.status == "failed").count()
    
    # Action items state
    open_actions = db.query(ActionItem).filter(ActionItem.status != ActionItemStatus.completed).count()
    completed_actions = db.query(ActionItem).filter(ActionItem.status == ActionItemStatus.completed).count()
    
    # Recent meetings
    recent_meetings = db.query(Meeting).order_by(Meeting.created_at.desc()).limit(5).all()
    recent_meetings_out = [
        {
            "id": m.id,
            "title": m.title,
            "date": m.date.isoformat(),
            "status": m.status.value,
            "owner": m.owner.full_name
        } for m in recent_meetings
    ]
    
    # Overdue action items
    today = datetime.now(timezone.utc).date()
    overdue_actions = db.query(ActionItem).filter(
        ActionItem.status != ActionItemStatus.completed,
        ActionItem.deadline < today
    ).limit(5).all()
    overdue_actions_out = [
        {
            "id": a.id,
            "description": a.description,
            "deadline": a.deadline.isoformat() if a.deadline else None,
            "assignee": a.assignee.full_name if a.assignee else "Unassigned"
        } for a in overdue_actions
    ]
    
    # Stats for staff specifically
    assigned_actions = db.query(ActionItem).filter(
        ActionItem.assignee_id == current_user.id
    ).count()
    
    return {
        "total_meetings": total_meetings,
        "meetings_this_month": meetings_this_month,
        "recorded_hours": recorded_hours,
        "active_staff": active_staff,
        "storage_usage_mb": storage_mb,
        "pending_jobs": pending_jobs,
        "failed_jobs": failed_jobs,
        "open_action_items": open_actions,
        "completed_action_items": completed_actions,
        "recent_meetings": recent_meetings_out,
        "overdue_action_items": overdue_actions_out,
        "staff_assigned_action_items": assigned_actions
    }
