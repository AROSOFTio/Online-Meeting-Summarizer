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
PRODUCT_NAME = "ConveneCore"
PRODUCT_LOGO_URL = "/convenecore-logo.svg"
PRODUCT_MARK_URL = "/convenecore-mark.svg"
LOGO_SETTING_KEY = "organization_logo_file"
LEGACY_LOGO_SETTING_KEY = "school_logo_file"
BUNDLED_LOGO = Path(__file__).resolve().parents[2] / "static" / "starlight-logo.jpg"
ALLOWED_LOGO_TYPES = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}

DEFAULT_SETTINGS = {
    "organization_name": "Starlight Secondary School",
    "organization_type": "School / Academic",
    "organization_logo_url": "/api/settings/logo",
    "organization_address": "Amuria District, Uganda",
    "organization_phone": "",
    "organization_email": "",
    "organization_website": settings.PUBLIC_APP_URL,
    "organization_motto": "RISE AND SHINE",
    "organization_registration": "",
    "timezone": "Africa/Kampala",
    "retention_period_days": "365",
    "minutes_document_title": "Official Meeting Minutes",
    "minutes_style": "Standard Professional",
    "minutes_language": "English",
    "agenda_label": "Agenda",
    "attendance_label": "Attendance Register",
    "proceedings_label": "Minutes / Proceedings",
    "decisions_label": "Resolutions / Key Decisions",
    "action_items_label": "Action Items",
    "transcript_appendix_label": "Appendix: Full Transcript",
}

LEGACY_ALIASES = {
    "organization_name": "school_name",
    "organization_logo_url": "school_logo_url",
}
REVERSE_LEGACY_ALIASES = {value: key for key, value in LEGACY_ALIASES.items()}
PUBLIC_BRANDING_KEYS = {
    "organization_name",
    "organization_type",
    "organization_logo_url",
    "organization_motto",
    "minutes_document_title",
    "minutes_style",
    "minutes_language",
}


def _find_setting(db: Session, key: str):
    return db.query(SystemSetting).filter(SystemSetting.key == key).first()


def _set_setting(db: Session, key: str, value: str) -> None:
    row = _find_setting(db, key)
    if row:
        row.value = value
    else:
        db.add(SystemSetting(key=key, value=value))


def get_db_setting(db: Session, key: str) -> str:
    setting = _find_setting(db, key)
    if setting:
        return setting.value

    legacy_key = LEGACY_ALIASES.get(key)
    if legacy_key:
        legacy = _find_setting(db, legacy_key)
        if legacy:
            _set_setting(db, key, legacy.value)
            db.commit()
            return legacy.value

    if key in DEFAULT_SETTINGS:
        _set_setting(db, key, DEFAULT_SETTINGS[key])
        db.commit()
        return DEFAULT_SETTINGS[key]
    return ""


def _settings_payload(db: Session) -> dict[str, str]:
    payload = {key: get_db_setting(db, key) for key in DEFAULT_SETTINGS}
    # Compatibility aliases keep older frontends/deployments functional while
    # organization_* becomes the canonical worldwide naming.
    payload["school_name"] = payload["organization_name"]
    payload["school_logo_url"] = payload["organization_logo_url"]
    return payload


@router.get("/branding")
def get_public_branding(db: Session = Depends(deps.get_db)):
    branding = {key: get_db_setting(db, key) for key in PUBLIC_BRANDING_KEYS}
    return {
        "product_name": PRODUCT_NAME,
        "product_logo_url": PRODUCT_LOGO_URL,
        "product_mark_url": PRODUCT_MARK_URL,
        **branding,
    }


@router.get("", include_in_schema=False)
@router.get("/")
def get_settings(db: Session = Depends(deps.get_db), current_user: User = Depends(deps.get_current_user)):
    return _settings_payload(db)


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
    for old_logo in branding_dir.glob("organization-logo.*"):
        old_logo.unlink(missing_ok=True)
    logo_path = branding_dir / f"organization-logo{extension}"
    logo_path.write_bytes(content)

    _set_setting(db, LOGO_SETTING_KEY, str(logo_path))
    _set_setting(db, LEGACY_LOGO_SETTING_KEY, str(logo_path))

    logo_url = f"/api/settings/logo?v={int(time())}"
    _set_setting(db, "organization_logo_url", logo_url)
    _set_setting(db, "school_logo_url", logo_url)
    db.commit()
    return {"organization_logo_url": logo_url, "school_logo_url": logo_url}


@router.get("/logo")
def get_logo(db: Session = Depends(deps.get_db)):
    custom = _find_setting(db, LOGO_SETTING_KEY) or _find_setting(db, LEGACY_LOGO_SETTING_KEY)
    if custom and os.path.isfile(custom.value) and not custom.value.lower().endswith(".svg"):
        return FileResponse(custom.value)
    if BUNDLED_LOGO.is_file():
        return FileResponse(BUNDLED_LOGO, media_type="image/jpeg")
    raise HTTPException(status_code=404, detail="Organization logo is not available")


@router.put("", include_in_schema=False)
@router.put("/")
def update_settings(
    settings_in: Dict[str, str],
    request: Request,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_admin_user),
):
    changed = []
    for incoming_key, value in settings_in.items():
        key = REVERSE_LEGACY_ALIASES.get(incoming_key, incoming_key)
        if key not in DEFAULT_SETTINGS:
            continue
        _set_setting(db, key, value)
        legacy_key = LEGACY_ALIASES.get(key)
        if legacy_key:
            _set_setting(db, legacy_key, value)
        changed.append(key)
    db.commit()
    log_action(
        db,
        action="update_settings",
        details=f"Admin updated settings: {sorted(set(changed))}",
        user_id=current_user.id,
        user_email=current_user.email,
        ip_address=request.client.host if request.client else None,
    )
    return _settings_payload(db)
