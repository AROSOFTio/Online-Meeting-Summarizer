import os
from pathlib import Path
from time import time
from typing import Dict

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core import deps
from app.core.audit import log_action
from app.core.config import settings
from app.models.models import SystemSetting, User

router = APIRouter()
LOGO_SETTING_KEY = "school_logo_file"
BUNDLED_LOGO = Path(__file__).resolve().parents[2] / "static" / "starlight-logo.jpg"
ALLOWED_LOGO_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
}

DEFAULT_SETTINGS = {
    "school_name": "Starlight Secondary School",
    "school_logo_url": "/api/settings/logo",
    "organization_address": "Amuria District, Uganda",
    "organization_phone": "",
    "organization_email": "",
    "organization_website": settings.PUBLIC_APP_URL,
    "organization_motto": "RISE AND SHINE",
    "organization_registration": "",
    "timezone": "Africa/Kampala",
    "retention_period_days": "365",
    "whisper_model": "disabled-gemini-transcription",
}


def get_db_setting(db: Session, key: str) -> str:
    setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if setting:
        return setting.value
    if key in DEFAULT_SETTINGS:
        setting = SystemSetting(key=key, value=DEFAULT_SETTINGS[key])
        db.add(setting)
        db.commit()
        db.refresh(setting)
        return setting.value
    return ""


@router.get("", include_in_schema=False)
@router.get("/")
def get_settings(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    return {key: get_db_setting(db, key) for key in DEFAULT_SETTINGS}


@router.post("/logo")
async def upload_logo(
    file: UploadFile = File(...),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_admin_user),
):
    extension = ALLOWED_LOGO_TYPES.get(file.content_type or "")
    if not extension:
        raise HTTPException(status_code=400, detail="Logo must be PNG, JPEG, or WebP")
    content = await file.read(5 * 1024 * 1024 + 1)
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Logo must be 5 MB or smaller")

    branding_dir = Path(settings.STORAGE_DIR) / "branding"
    branding_dir.mkdir(parents=True, exist_ok=True)
    for old_logo in branding_dir.glob("school-logo.*"):
        old_logo.unlink(missing_ok=True)
    logo_path = branding_dir / f"school-logo{extension}"
    logo_path.write_bytes(content)

    stored_path = db.query(SystemSetting).filter(SystemSetting.key == LOGO_SETTING_KEY).first()
    if stored_path:
        stored_path.value = str(logo_path)
    else:
        db.add(SystemSetting(key=LOGO_SETTING_KEY, value=str(logo_path)))

    logo_url = f"/api/settings/logo?v={int(time())}"
    url_setting = db.query(SystemSetting).filter(SystemSetting.key == "school_logo_url").first()
    if url_setting:
        url_setting.value = logo_url
    else:
        db.add(SystemSetting(key="school_logo_url", value=logo_url))
    db.commit()
    return {"school_logo_url": logo_url}


@router.get("/logo")
def get_logo(db: Session = Depends(deps.get_db)):
    custom = db.query(SystemSetting).filter(SystemSetting.key == LOGO_SETTING_KEY).first()
    if custom and os.path.isfile(custom.value) and not custom.value.lower().endswith(".svg"):
        return FileResponse(custom.value)
    if BUNDLED_LOGO.is_file():
        return FileResponse(BUNDLED_LOGO, media_type="image/jpeg")
    raise HTTPException(status_code=404, detail="School logo is not available")


@router.put("", include_in_schema=False)
@router.put("/")
def update_settings(
    settings_in: Dict[str, str],
    request: Request,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_admin_user),
):
    changed = []
    for key, value in settings_in.items():
        if key not in DEFAULT_SETTINGS:
            continue
        row = db.query(SystemSetting).filter(SystemSetting.key == key).first()
        if row:
            row.value = value
        else:
            db.add(SystemSetting(key=key, value=value))
        changed.append(key)
    db.commit()
    log_action(
        db,
        action="update_settings",
        details=f"Admin updated settings: {changed}",
        user_id=current_user.id,
        user_email=current_user.email,
        ip_address=request.client.host if request.client else None,
    )
    return {key: get_db_setting(db, key) for key in DEFAULT_SETTINGS}
