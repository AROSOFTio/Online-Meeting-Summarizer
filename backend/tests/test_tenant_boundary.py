import pytest
from app.core.config import settings
from app.core.tenant_boundary import bind_or_verify_storage, bind_or_verify_database
from app.models.models import User, UserRole
from app.core.security import get_password_hash


def test_storage_identity_rejects_reuse(tmp_path, monkeypatch):
    monkeypatch.setattr(settings,"STORAGE_DIR",str(tmp_path))
    monkeypatch.setattr(settings,"TENANT_ID","alpha")
    bind_or_verify_storage(initialize=True)
    bind_or_verify_storage()
    monkeypatch.setattr(settings,"TENANT_ID","bravo")
    with pytest.raises(RuntimeError):
        bind_or_verify_storage(initialize=True)


def test_database_identity_rejects_reuse(db, monkeypatch):
    monkeypatch.setattr(settings,"TENANT_ID","alpha")
    bind_or_verify_database(db,initialize=True)
    bind_or_verify_database(db)
    monkeypatch.setattr(settings,"TENANT_ID","bravo")
    with pytest.raises(RuntimeError):
        bind_or_verify_database(db,initialize=True)


def test_no_automatic_legacy_adoption(db, monkeypatch):
    db.add(User(email="legacy@example.com",full_name="Legacy",hashed_password=get_password_hash("Example123!"),role=UserRole.admin))
    db.commit()
    monkeypatch.setattr(settings,"TENANT_ID","alpha")
    with pytest.raises(RuntimeError):
        bind_or_verify_database(db,initialize=True)
