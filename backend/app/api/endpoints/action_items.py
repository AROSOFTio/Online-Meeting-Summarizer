from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core import deps
from app.core.audit import log_action
from app.models.models import ActionItem, ActionItemStatus, ActionItemPriority, Meeting, User, UserRole

router = APIRouter()


@router.get("/")
def list_action_items(
    meeting_id: Optional[int] = None,
    assignee_id: Optional[int] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """List all action items with optional filters by meeting, assignee, status, priority."""
    query = db.query(ActionItem)

    if meeting_id:
        query = query.filter(ActionItem.meeting_id == meeting_id)

    if assignee_id:
        query = query.filter(ActionItem.assignee_id == assignee_id)

    if status:
        query = query.filter(ActionItem.status == status)

    if priority:
        query = query.filter(ActionItem.priority == priority)

    # Non-admins only see items for meetings they own or participate in
    if current_user.role != UserRole.admin:
        from app.models.models import Participant
        query = query.join(Meeting).filter(
            (Meeting.owner_id == current_user.id) |
            (Meeting.participants.any(Participant.email == current_user.email))
        )

    items = query.order_by(ActionItem.deadline.asc().nulls_last(), ActionItem.created_at.desc()).all()

    result = []
    for item in items:
        result.append({
            "id": item.id,
            "meeting_id": item.meeting_id,
            "text": item.description,
            "assignee_id": item.assignee_id,
            "assignee_name": item.assignee.full_name if item.assignee else None,
            "priority": item.priority,
            "deadline": str(item.deadline) if item.deadline else None,
            "status": item.status,
            "created_at": item.created_at.isoformat(),
            "updated_at": item.updated_at.isoformat(),
        })

    return result


@router.post("/")
def create_action_item(
    request: Request,
    body: dict,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Manually create an action item for a meeting."""
    meeting_id = body.get("meeting_id")
    text = body.get("text", "").strip()

    if not meeting_id or not text:
        raise HTTPException(status_code=400, detail="meeting_id and text are required")

    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    if current_user.role != UserRole.admin and meeting.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorised")

    # Parse deadline string to date if provided
    deadline = None
    if body.get("deadline"):
        from datetime import date
        try:
            deadline = date.fromisoformat(body["deadline"])
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid deadline format. Use YYYY-MM-DD.")

    item = ActionItem(
        meeting_id=meeting_id,
        description=text,
        assignee_id=body.get("assignee_id"),
        priority=body.get("priority", "medium"),
        status=body.get("status", "pending"),
        deadline=deadline,
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    log_action(db, action="create_action_item",
               details=f"Created action item for meeting {meeting_id}: {text[:60]}",
               user_id=current_user.id, user_email=current_user.email,
               ip_address=request.client.host if request.client else None)

    return {
        "id": item.id,
        "meeting_id": item.meeting_id,
        "text": item.description,
        "assignee_id": item.assignee_id,
        "assignee_name": item.assignee.full_name if item.assignee else None,
        "priority": item.priority,
        "deadline": str(item.deadline) if item.deadline else None,
        "status": item.status,
    }


@router.put("/{item_id}")
def update_action_item(
    item_id: int,
    request: Request,
    body: dict,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Update text, assignee, priority, deadline, or status of an action item."""
    item = db.query(ActionItem).filter(ActionItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Action item not found")

    meeting = item.meeting
    if current_user.role != UserRole.admin and meeting.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorised")

    if "text" in body:
        item.description = body["text"]
    if "assignee_id" in body:
        item.assignee_id = body["assignee_id"]
    if "priority" in body:
        item.priority = body["priority"]
    if "status" in body:
        item.status = body["status"]
    if "deadline" in body:
        if body["deadline"]:
            from datetime import date
            try:
                item.deadline = date.fromisoformat(body["deadline"])
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid deadline format. Use YYYY-MM-DD.")
        else:
            item.deadline = None

    db.commit()
    db.refresh(item)

    log_action(db, action="update_action_item",
               details=f"Updated action item {item_id} status={item.status}",
               user_id=current_user.id, user_email=current_user.email,
               ip_address=request.client.host if request.client else None)

    return {
        "id": item.id,
        "meeting_id": item.meeting_id,
        "text": item.description,
        "assignee_id": item.assignee_id,
        "assignee_name": item.assignee.full_name if item.assignee else None,
        "priority": item.priority,
        "deadline": str(item.deadline) if item.deadline else None,
        "status": item.status,
        "updated_at": item.updated_at.isoformat(),
    }


@router.delete("/{item_id}")
def delete_action_item(
    item_id: int,
    request: Request,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Delete an action item."""
    item = db.query(ActionItem).filter(ActionItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Action item not found")

    meeting = item.meeting
    if current_user.role != UserRole.admin and meeting.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorised")

    db.delete(item)
    db.commit()

    log_action(db, action="delete_action_item",
               details=f"Deleted action item {item_id}",
               user_id=current_user.id, user_email=current_user.email,
               ip_address=request.client.host if request.client else None)

    return {"detail": "Action item deleted"}
