"""Fail closed when a managed process is pointed at another tenant's data."""
from pathlib import Path
from sqlalchemy import text
from app.core.config import settings

MARKER = "__convenecore_tenant_identity__"


def bind_or_verify_database(db, *, initialize=False):
    row = db.execute(text("SELECT value FROM system_settings WHERE key=:key"), {"key":MARKER}).scalar_one_or_none()
    tenant = settings.TENANT_ID
    if row is not None:
        if not tenant or row != tenant:
            raise RuntimeError("Database tenant identity mismatch")
        return
    if not tenant:
        return
    if not initialize:
        raise RuntimeError("Database tenant identity has not been initialized")
    # An existing unlabelled installation requires an explicit, offline migration.
    if db.execute(text("SELECT COUNT(*) FROM users")).scalar_one() or db.execute(text("SELECT COUNT(*) FROM meetings")).scalar_one():
        raise RuntimeError("Refusing to adopt an existing database automatically")
    db.execute(text("INSERT INTO system_settings (key,value,created_at,updated_at) VALUES (:key,:value,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)"), {"key":MARKER,"value":tenant})
    db.commit()


def bind_or_verify_storage(*, initialize=False):
    root=Path(settings.STORAGE_DIR).resolve()
    marker=root/".convenecore-tenant"
    if marker.exists():
        if not settings.TENANT_ID or marker.read_text().strip()!=settings.TENANT_ID:
            raise RuntimeError("Storage tenant identity mismatch")
        return
    if not settings.TENANT_ID:
        return
    if not initialize or any(p.is_file() or p.is_symlink() for p in root.rglob("*")):
        raise RuntimeError("Refusing to adopt unlabelled non-empty storage")
    with marker.open("x") as handle:
        handle.write(settings.TENANT_ID+"\n")
