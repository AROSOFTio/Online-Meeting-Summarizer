import os
from pathlib import Path
from time import time

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import Dict

from app.core import deps
from app.core.audit import log_action
from app.core.config import settings
from app.models.models import User, SystemSetting

router = APIRouter()
LOGO_SETTING_KEY = "school_logo_file"
ALLOWED_LOGO_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
}

DEFAULT_SETTINGS = {
    "school_name": "Starlight Secondary School",
    "school_logo_url": "/images/logo.png",
    "organization_address": "Amuria District, Uganda",
    "organization_phone": "",
    "organization_email": "",
    "organization_website": "",
    "organization_motto": "",
    "organization_registration": "",
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

@router.get("", include_in_schema=False)
@router.get("/")
def get_settings(db: Session = Depends(deps.get_db), current_user: User = Depends(deps.get_current_user)):
    """Fetch all school settings (Authenticated Users Only)"""
    settings_dict = {}
    for key in DEFAULT_SETTINGS.keys():
        settings_dict[key] = get_db_setting(db, key)
    return settings_dict


@router.post("/logo")
async def upload_logo(
    file: UploadFile = File(...),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_admin_user),
):
    extension = ALLOWED_LOGO_TYPES.get(file.content_type or "")
    if not extension:
        raise HTTPException(status_code=400, detail="Logo must be PNG, JPEG, WebP, or SVG")
    content = await file.read(5 * 1024 * 1024 + 1)
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Logo must be 5 MB or smaller")

    branding_dir = Path(settings.STORAGE_DIR) / "branding"
    branding_dir.mkdir(parents=True, exist_ok=True)
    for old_logo in branding_dir.glob("school-logo.*"):
        old_logo.unlink(missing_ok=True)
    logo_path = branding_dir / f"school-logo{extension}"
    logo_path.write_bytes(content)

    setting = db.query(SystemSetting).filter(SystemSetting.key == LOGO_SETTING_KEY).first()
    if setting:
        setting.value = str(logo_path)
    else:
        db.add(SystemSetting(key=LOGO_SETTING_KEY, value=str(logo_path)))
    logo_url = f"/api/settings/logo?v={int(time())}"
    logo_url_setting = db.query(SystemSetting).filter(SystemSetting.key == "school_logo_url").first()
    if logo_url_setting:
        logo_url_setting.value = logo_url
    else:
        db.add(SystemSetting(key="school_logo_url", value=logo_url))
    db.commit()
    return {"school_logo_url": logo_url}


@router.get("/logo")
def get_logo(db: Session = Depends(deps.get_db)):
    setting = db.query(SystemSetting).filter(SystemSetting.key == LOGO_SETTING_KEY).first()
    if not setting or not os.path.isfile(setting.value):
        raise HTTPException(status_code=404, detail="No custom logo uploaded")
    return FileResponse(setting.value)

@router.put("", include_in_schema=False)
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
