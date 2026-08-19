from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core import deps
from app.core.audit import log_action
from app.models.models import ActionItem, Meeting, Participant, User, UserRole

router = APIRouter()


def _responsible_name(item: ActionItem) -> Optional[str]:
    if item.assignee:
        return item.assignee.full_name
    return item.responsible_name or None


def _item_payload(item: ActionItem) -> dict:
    return {
        "id": item.id,
        "meeting_id": item.meeting_id,
        "text": item.description,
        "assignee_id": item.assignee_id,
        "assignee_name": _responsible_name(item),
        "responsible_name": item.responsible_name,
        "priority": item.priority,
        "deadline": str(item.deadline) if item.deadline else None,
        "status": item.status,
        "created_at": item.created_at.isoformat(),
        "updated_at": item.updated_at.isoformat(),
    }


@router.get("/")
def list_action_items(
    meeting_id: Optional[int] = None,
    assignee_id: Optional[int] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    query = db.query(ActionItem)
    if meeting_id:
        query = query.filter(ActionItem.meeting_id == meeting_id)
    if assignee_id:
        query = query.filter(ActionItem.assignee_id == assignee_id)
    if status:
        query = query.filter(ActionItem.status == status)
    if priority:
        query = query.filter(ActionItem.priority == priority)

    if current_user.role != UserRole.admin:
        query = query.join(Meeting).filter(
            (Meeting.owner_id == current_user.id)
            | (Meeting.participants.any(Participant.email == current_user.email))
        )

    items = query.order_by(ActionItem.deadline.asc().nulls_last(), ActionItem.created_at.desc()).all()
    return [_item_payload(item) for item in items]


@router.post("/")
def create_action_item(
    request: Request,
    body: dict,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_minutes_editor),
):
    meeting_id = body.get("meeting_id")
    text_value = str(body.get("text", "")).strip()
    if not meeting_id or not text_value:
        raise HTTPException(status_code=400, detail="meeting_id and text are required")

    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if current_user.role != UserRole.admin and meeting.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorised")

    deadline = None
    if body.get("deadline"):
        try:
            deadline = date.fromisoformat(body["deadline"])
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid deadline format. Use YYYY-MM-DD.") from exc

    responsible_name = str(body.get("responsible_name") or "").strip() or None
    assignee_id = body.get("assignee_id")
    item = ActionItem(
        meeting_id=meeting_id,
        description=text_value,
        assignee_id=assignee_id,
        responsible_name=None if assignee_id else responsible_name,
        priority=body.get("priority", "medium"),
        status=body.get("status", "pending"),
        deadline=deadline,
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    log_action(
        db,
        action="create_action_item",
        details=f"Created action item for meeting {meeting_id}: {text_value[:60]}",
        user_id=current_user.id,
        user_email=current_user.email,
        ip_address=request.client.host if request.client else None,
    )
    return _item_payload(item)


@router.put("/{item_id}")
def update_action_item(
    item_id: int,
    request: Request,
    body: dict,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_minutes_editor),
):
    item = db.query(ActionItem).filter(ActionItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Action item not found")

    meeting = item.meeting
    if current_user.role != UserRole.admin and meeting.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorised")

    if "text" in body:
        text_value = str(body["text"] or "").strip()
        if not text_value:
            raise HTTPException(status_code=400, detail="Action item text cannot be empty")
        item.description = text_value

    if "assignee_id" in body:
        item.assignee_id = body["assignee_id"] or None
        if item.assignee_id:
            item.responsible_name = None

    if "responsible_name" in body:
        item.responsible_name = str(body["responsible_name"] or "").strip() or None
        # Typing or choosing a participant name from the free-text picker makes
        # that name authoritative, even when the person is not a system user.
        if "assignee_id" not in body:
            item.assignee_id = None

    if "priority" in body:
        item.priority = body["priority"]
    if "status" in body:
        item.status = body["status"]
    if "deadline" in body:
        if body["deadline"]:
            try:
                item.deadline = date.fromisoformat(body["deadline"])
            except ValueError as exc:
                raise HTTPException(status_code=400, detail="Invalid deadline format. Use YYYY-MM-DD.") from exc
        else:
            item.deadline = None

    db.commit()
    db.refresh(item)
    log_action(
        db,
        action="update_action_item",
        details=f"Updated action item {item_id}",
        user_id=current_user.id,
        user_email=current_user.email,
        ip_address=request.client.host if request.client else None,
    )
    return _item_payload(item)


@router.delete("/{item_id}")
def delete_action_item(
    item_id: int,
    request: Request,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_minutes_editor),
):
    item = db.query(ActionItem).filter(ActionItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Action item not found")
    meeting = item.meeting
    if current_user.role != UserRole.admin and meeting.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorised")
    db.delete(item)
    db.commit()
    log_action(
        db,
        action="delete_action_item",
        details=f"Deleted action item {item_id}",
        user_id=current_user.id,
        user_email=current_user.email,
        ip_address=request.client.host if request.client else None,
    )
    return {"detail": "Action item deleted"}
