import json
from datetime import datetime,timezone
from pathlib import Path
import pytest
from app.core import subscriptions as s
from app.core.config import settings
from app.core.security import get_password_hash
from app.models.models import User,UserRole

@pytest.fixture
def managed_policy(tmp_path,monkeypatch):
    path=tmp_path/"policy.json"
    storage=tmp_path/"storage";storage.mkdir()
    p={"tenant":"alpha","plan":"custom","expiry":"","grace_days":0,"limits":{"users":1,"storage_gib":1,"ai_minutes":1},"features":["ai","recording","exports"]}
    path.write_text(json.dumps(p))
    monkeypatch.setattr(settings,"TENANT_ID","alpha")
    monkeypatch.setattr(settings,"SUBSCRIPTION_POLICY_FILE",str(path))
    monkeypatch.setattr(settings,"STORAGE_DIR",str(storage))
    return p,path,storage

def test_feature_and_expiry_requests(managed_policy):
    p,path,_=managed_policy
    with pytest.raises(s.SubscriptionDenied) as exc:s.check_request("/api/live-rooms/1/join","POST")
    assert exc.value.status_code==403
    s.check_request("/api/meetings/1/export","GET")
    p["expiry"]="2000-01-01";path.write_text(json.dumps(p))
    with pytest.raises(s.SubscriptionDenied) as exc:s.check_request("/api/meetings/","POST")
    assert exc.value.status_code==402
    s.check_request("/api/meetings/1","GET")
    s.check_request("/api/staff/2","DELETE")
    p["expiry"]="";path.write_text(json.dumps(p))
    s.check_request("/api/meetings/","POST")

def test_seat_quota(db,managed_policy):
    s.check_user_slot(db)
    user=User(email="one@example.com",full_name="One",hashed_password=get_password_hash("Example123!"),role=UserRole.admin,is_active=True)
    db.add(user);db.commit()
    with pytest.raises(s.SubscriptionDenied) as exc:s.check_user_slot(db)
    assert exc.value.status_code==409
    user.is_active=False;db.commit()
    s.check_user_slot(db)

def test_storage_quota(managed_policy):
    _,_,storage=managed_policy
    with s.storage_write(1):
        (storage/"fixture").write_bytes(b"a")
    assert s.storage_bytes()==1
    with pytest.raises(s.SubscriptionDenied) as exc:
        with s.storage_write(2**30):pass
    assert exc.value.status_code==409
    (storage/"fixture").unlink()
    with s.storage_write(2**30):pass

def test_ai_ledger(db,managed_policy):
    s.reserve_ai(40.1)
    s.reserve_ai(19)
    with pytest.raises(s.SubscriptionDenied) as exc:s.reserve_ai(1)
    assert exc.value.status_code==429
    assert s.snapshot(db)["usage"]["ai_seconds"]==60
    assert s.snapshot(db)["usage"]["ai_seconds_remaining"]==0
