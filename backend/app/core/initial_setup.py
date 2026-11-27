"""Single-use administrator onboarding. Tokens are only persisted as digests."""
import hashlib
import hmac
import json
import re
import time
import secrets

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

def otp_digest(email, nonce, code):
    message=f"initial-setup:{settings.TENANT_ID}:{email}:{nonce}:{code}".encode()
    return hmac.new(settings.SECRET_KEY.encode(),message,hashlib.sha256).hexdigest()

def issue_otp(db:Session,email:str):
    """Return code for delivery only; never expose it in an API response."""
    if not settings.TENANT_ID or email!=str(settings.ADMIN_EMAIL):
        return None
    user=db.query(User).filter(User.email==email).with_for_update().first()
    if not user or user.role!=UserRole.admin or not user.is_active or not user.must_change_password:
        return None
    row=db.query(SystemSetting).filter(SystemSetting.key==KEY).with_for_update().first()
    now=int(time.time())
    old=json.loads(row.value) if row else {}
    sends=[t for t in old.get("sends",[]) if now-3600<t<=now]
    if len(sends)>=5 or (sends and now-sends[-1]<60):
        return None
    code=f"{secrets.randbelow(1000000):06d}"
    nonce=secrets.token_hex(16)
    data=json.dumps({"kind":"otp","digest":otp_digest(email,nonce,code),"nonce":nonce,
                     "expires":now+600,"email":email,"attempts":0,"sends":sends+[now]})
    if row:row.value=data
    else:db.add(SystemSetting(key=KEY,value=data))
    db.commit()
    return code

def consume(db:Session,email:str,code:str,password:str):
    if not settings.TENANT_ID or not re.fullmatch(r"(?:[0-9]{6}|[A-Za-z0-9_-]{43})",code):
        return False
    if not 8<=len(password)<=128 or not re.search(r"[A-Z]",password) or not re.search(r"[a-z]",password) or not re.search(r"[^A-Za-z0-9]",password):
        raise ValueError("Use 8–128 characters, uppercase, lowercase and a special character.")
    user=db.query(User).filter(User.email==email).with_for_update().first()
    if not user or user.role!=UserRole.admin or not user.is_active or not user.must_change_password or user.email!=str(settings.ADMIN_EMAIL):
        return False
    row=db.query(SystemSetting).filter(SystemSetting.key==KEY).with_for_update().first()
    if not row:return False
    data=json.loads(row.value)
    if data["email"]!=email or data["expires"]<=int(time.time()):
        return False
    if data.get("kind")=="otp":
        if not re.fullmatch(r"[0-9]{6}",code) or data.get("attempts",0)>=5:
            return False
        if not hmac.compare_digest(data["digest"],otp_digest(email,data["nonce"],code)):
            data["attempts"]=data.get("attempts",0)+1
            row.value=json.dumps(data)
            db.commit()
            return False
    elif not re.fullmatch(r"[A-Za-z0-9_-]{43}",code) or not hmac.compare_digest(data["digest"],hashlib.sha256(code.encode()).hexdigest()):
        return False
    user.hashed_password=get_password_hash(password)
    user.must_change_password=False
    db.delete(row)
    db.commit()
    return True
