import hashlib
import secrets
import time
import pytest
from app.core.config import settings
from app.core.initial_setup import issue, consume, issue_otp
from app.core.security import get_password_hash, verify_password
from app.models.models import User, UserRole

def test_single_use_initial_setup(db,monkeypatch):
    monkeypatch.setattr(settings,"TENANT_ID","alpha")
    email=str(settings.ADMIN_EMAIL)
    user=User(email=email,full_name="Example",hashed_password=get_password_hash("Temporary123!"),role=UserRole.admin,is_active=True,must_change_password=True)
    db.add(user)
    db.commit()
    code=secrets.token_urlsafe(32)
    digest=hashlib.sha256(code.encode()).hexdigest()
    issue(db,email,digest,int(time.time())+600)
    assert not consume(db,email,"x"*43,"NewPassword123!")
    with pytest.raises(ValueError):
        consume(db,email,code,"Short1!")
    assert consume(db,email,code,"Strong1!")
    db.refresh(user)
    assert not user.must_change_password
    assert verify_password("Strong1!",user.hashed_password)
    assert not consume(db,email,code,"AnotherPassword123!")
    with pytest.raises(ValueError):
        issue(db,email,digest,int(time.time())+600)


def test_email_otp_expiry_attempts_and_replay(db,monkeypatch):
    import json
    from app.core.initial_setup import KEY
    from app.models.models import SystemSetting
    monkeypatch.setattr(settings,"TENANT_ID","alpha")
    email=str(settings.ADMIN_EMAIL)
    user=User(email=email,full_name="Example",hashed_password=get_password_hash("Temporary123!"),role=UserRole.admin,is_active=True,must_change_password=True)
    db.add(user);db.commit()
    assert issue_otp(db,"unregistered@example.com") is None
    code=issue_otp(db,email)
    assert len(code)==6 and code.isdigit()
    assert issue_otp(db,email) is None
    row=db.query(SystemSetting).filter(SystemSetting.key==KEY).first()
    data=json.loads(row.value)
    assert data["digest"]!=code and len(data["digest"])==64
    wrong="000000" if code!="000000" else "111111"
    for _ in range(5):
        assert not consume(db,email,wrong,"Strong1!")
    assert not consume(db,email,code,"Strong1!")
    data=json.loads(row.value);data["sends"]=[int(time.time())-61];row.value=json.dumps(data);db.commit()
    code=issue_otp(db,email)
    assert code and consume(db,email,code,"Strong1!")
    assert not consume(db,email,code,"Strong1!")
    assert issue_otp(db,email) is None
