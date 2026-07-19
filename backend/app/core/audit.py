from typing import Optional
from sqlalchemy.orm import Session
from app.models.models import AuditLog

def log_action(
    db: Session,
    action: str,
    details: Optional[str] = None,
    user_id: Optional[int] = None,
    user_email: Optional[str] = None,
    ip_address: Optional[str] = None
) -> AuditLog:
    """Log an audit entry for security-sensitive or content-changing operations."""
    audit_entry = AuditLog(
        user_id=user_id,
        user_email=user_email,
        action=action,
        details=details,
        ip_address=ip_address
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(audit_entry)
    return audit_entry
