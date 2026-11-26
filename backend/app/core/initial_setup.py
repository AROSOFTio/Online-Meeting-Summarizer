"""Single-use administrator onboarding. Tokens are only persisted as digests."""
import hashlib
import hmac
import json
import re
import time

from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.security import get_password_hash
from app.models.models import User, UserRole, SystemSetting

KEY="__convenecore_initial_admin_setup__"

def issue(db:Session,email:str,digest:str,expires:int):
    if not settings.TENANT_ID or not re.fullmatch(r"[0-9a-f]{64}",digest) or not int(time.time())<expires<=int(time.time())+86400:
        raise ValueError("Invalid setup issuance.")
    user=db.query(User).filter(User.email==email).with_for_update().first()
    if not user or user.role!=UserRole.admin or not user.is_active or not user.must_change_password or user.email!=str(settings.ADMIN_EMAIL):
        raise ValueError("Initial administrator is not eligible for setup.")
    row=db.query(SystemSetting).filter(SystemSetting.key==KEY).with_for_update().first()
    data=json.dumps({"digest":digest,"expires":expires,"email":email})
    if row:row.value=data
    else:db.add(SystemSetting(key=KEY,value=data))
    db.commit()

def consume(db:Session,email:str,code:str,password:str):
    if not settings.TENANT_ID or not re.fullmatch(r"[A-Za-z0-9_-]{43}",code):
        return False
    if not 8<=len(password)<=128 or not re.search(r"[A-Z]",password) or not re.search(r"[a-z]",password) or not re.search(r"[^A-Za-z0-9]",password):
        raise ValueError("Use 8–128 characters, uppercase, lowercase and a special character.")
    user=db.query(User).filter(User.email==email).with_for_update().first()
    if not user or user.role!=UserRole.admin or not user.is_active or not user.must_change_password or user.email!=str(settings.ADMIN_EMAIL):
        return False
    row=db.query(SystemSetting).filter(SystemSetting.key==KEY).with_for_update().first()
    if not row:return False
    data=json.loads(row.value)
    if data["email"]!=email or data["expires"]<int(time.time()) or not hmac.compare_digest(data["digest"],hashlib.sha256(code.encode()).hexdigest()):
        return False
    user.hashed_password=get_password_hash(password)
    user.must_change_password=False
    db.delete(row)
    db.commit()
    return True
