from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from typing import Dict

from app.core import deps
from app.core.audit import log_action
from app.models.models import User, SystemSetting

router = APIRouter()

DEFAULT_SETTINGS = {
    "school_name": "Starlight Secondary School",
    "school_logo_url": "/images/logo.png",
    "timezone": "Africa/Kampala",
    "retention_period_days": "365",
    "whisper_model": "base"
}

def get_db_setting(db: Session, key: str) -> str:
    setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if setting:
        return setting.value
    # Seed default on the fly if not exists
    if key in DEFAULT_SETTINGS:
        new_setting = SystemSetting(key=key, value=DEFAULT_SETTINGS[key])
        db.add(new_setting)
        db.commit()
        db.refresh(new_setting)
        return new_setting.value
    return ""

@router.get("/")
def get_settings(db: Session = Depends(deps.get_db), current_user: User = Depends(deps.get_current_user)):
    """Fetch all school settings (Authenticated Users Only)"""
    settings_dict = {}
    for key in DEFAULT_SETTINGS.keys():
        settings_dict[key] = get_db_setting(db, key)
    return settings_dict

@router.put("/")
def update_settings(
    settings_in: Dict[str, str],
    request: Request,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_admin_user)
):
    """Update system settings (Admin Only)"""
    for key, value in settings_in.items():
        if key not in DEFAULT_SETTINGS:
            continue
        setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
        if setting:
            setting.value = value
        else:
            setting = SystemSetting(key=key, value=value)
            db.add(setting)
            
    db.commit()
    
    log_action(
        db,
        action="update_settings",
        details=f"Admin updated settings: {list(settings_in.keys())}",
        user_id=current_user.id,
        user_email=current_user.email,
        ip_address=request.client.host if request.client else None
    )
    
    # Return updated settings
    settings_dict = {}
    for key in DEFAULT_SETTINGS.keys():
        settings_dict[key] = get_db_setting(db, key)
    return settings_dict
