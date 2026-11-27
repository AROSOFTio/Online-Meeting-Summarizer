import fcntl
import math
import os
import shutil
from contextlib import contextmanager
from pathlib import Path
from fastapi import HTTPException
from sqlalchemy import text
from app.core.config import settings
from app.core.database import SessionLocal
from app.core import subscription_policy as rules
from app.models.models import SystemSetting, User

class SubscriptionDenied(HTTPException):
    def __str__(self):return str(self.detail)
def policy():
    if not settings.TENANT_ID:return None
    try:return rules.load(settings.SUBSCRIPTION_POLICY_FILE,settings.TENANT_ID)
    except Exception as exc:raise SubscriptionDenied(503,"Workspace subscription configuration unavailable. Contact your platform administrator.") from exc
def require(feature=None):
    p=policy()
    if p is None:return None
    if rules.state(p)=="expired":raise SubscriptionDenied(402,"Subscription expired. Renew to continue.")
    if feature and feature not in p["features"]:raise SubscriptionDenied(403,"Feature not included in subscription.")
    return p
def feature_enabled(feature):
    p=policy()
    return p is None or (rules.state(p)!="expired" and feature in p["features"])
def check_request(path,method):
    if not settings.TENANT_ID or not path.startswith("/api/"):return
    if path.rstrip("/") in {"/api/health","/api/auth/login","/api/auth/logout","/api/auth/me","/api/auth/change-password","/api/auth/setup","/api/auth/setup/request-code"}:return
    p=policy()
    if rules.state(p)=="expired" and not rules.allowed_when_expired(path,method):raise SubscriptionDenied(402,"Subscription expired. Existing records remain available; renew to make changes.")
    if not rules.route_features(path,method)<=set(p["features"]):raise SubscriptionDenied(403,"Feature not included in subscription.")
def db_lock(db,key):
    if db.get_bind().dialect.name=="postgresql":db.execute(text("SELECT pg_advisory_xact_lock(:key)"),{"key":key})
def check_user_slot(db):
    if require() is None:return
    db_lock(db,74312001)
    p=require()
    if db.query(User).filter(User.is_active.is_(True)).count()>=p["limits"]["users"]:raise SubscriptionDenied(409,"Active user limit reached. Deactivate an account or upgrade.")
def storage_bytes():
    total=0
    for root,dirs,files in os.walk(settings.STORAGE_DIR,followlinks=False):
        dirs[:]=[d for d in dirs if not Path(root,d).is_symlink()]
        for name in files:
            path=Path(root,name)
            if name in {".convenecore-tenant",".subscription-storage.lock"} or path.is_symlink():continue
            try:total+=path.stat().st_size
            except FileNotFoundError:continue
    return total
@contextmanager
def storage_write(size=0):
    if not settings.TENANT_ID:
        yield
        return
    root=Path(settings.STORAGE_DIR)
    with (root/".subscription-storage.lock").open("a") as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        p=require()
        from app.core.organization_context import current
        if current.get() is not None and shutil.disk_usage(root).free<10*1024**3+max(size,0):
            raise SubscriptionDenied(507,"Platform storage temporarily unavailable")
        if size<0 or storage_bytes()+size>p["limits"]["storage_gib"]*2**30:raise SubscriptionDenied(409,"Storage quota reached. Free storage or upgrade.")
        yield
def remaining_ai(db,p):
    row=db.query(SystemSetting).filter(SystemSetting.key==rules.monthly_key()).first()
    used=int(row.value) if row else 0
    if used<0:raise SubscriptionDenied(503,"AI usage ledger invalid")
    return used,max(0,p["limits"]["ai_minutes"]*60-used)
def check_ai_available(seconds=1):
    p=require("ai")
    if p is None:return
    with SessionLocal() as db:
        if remaining_ai(db,p)[1]<seconds:raise SubscriptionDenied(429,"Monthly AI allowance exhausted.")
def reserve_ai(seconds):
    if not settings.TENANT_ID:return
    if not math.isfinite(seconds) or seconds<=0:raise SubscriptionDenied(422,"Valid media duration required.")
    amount=max(1,math.ceil(seconds))
    with SessionLocal() as db:
        db_lock(db,74312002)
        p=require("ai")
        key=rules.monthly_key()
        row=db.query(SystemSetting).filter(SystemSetting.key==key).first()
        used=int(row.value) if row else 0
        if used<0:raise SubscriptionDenied(503,"AI usage ledger invalid")
        if used+amount>p["limits"]["ai_minutes"]*60:raise SubscriptionDenied(429,"Monthly AI allowance exhausted.")
        if row:row.value=str(used+amount)
        else:db.add(SystemSetting(key=key,value=str(amount)))
        db.commit()
def snapshot(db):
    p=policy()
    if p is None:return {"managed":False,"state":"standalone","features":sorted(rules.FEATURES)}
    used,remaining=remaining_ai(db,p)
    return {"managed":True,**p,"state":rules.state(p),"usage":{"active_users":db.query(User).filter(User.is_active.is_(True)).count(),"storage_bytes":storage_bytes(),"ai_seconds":used,"ai_seconds_remaining":remaining},"ai_period_utc":rules.monthly_key().removeprefix("__cc_ai_seconds_").replace("_","-")}
