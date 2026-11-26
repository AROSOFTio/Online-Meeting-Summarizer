import json
from datetime import date, datetime, timezone, timedelta
from pathlib import Path
FEATURES={"live","recording","ai","templates","exports","actions","audit"}
LIMITS={"users":100000,"storage_gib":1000000,"ai_minutes":10000000}
def load(path,tenant):
    p=json.loads(Path(path).read_text())
    if p["tenant"]!=tenant or p["plan"] not in {"starter","professional","enterprise","custom"}:raise ValueError("Invalid subscription")
    if p["expiry"] and date.fromisoformat(p["expiry"]).isoformat()!=p["expiry"]:raise ValueError("Invalid expiry")
    if type(p["grace_days"])!=int or not 0<=p["grace_days"]<=30:raise ValueError("Invalid grace")
    if set(p["limits"])!=set(LIMITS) or any(type(v)!=int or not 1<=v<=LIMITS[k] for k,v in p["limits"].items()):raise ValueError("Invalid limits")
    if not isinstance(p["features"],list) or not set(p["features"])<=FEATURES:raise ValueError("Invalid features")
    return p
def state(p,today=None):
    today=today or datetime.now(timezone.utc).date()
    if not p["expiry"]:return "active"
    expiry=date.fromisoformat(p["expiry"])
    return "active" if today<=expiry else "grace" if today<=expiry+timedelta(days=p["grace_days"]) else "expired"
def route_features(path,method):
    parts=path.strip("/").split("/")
    if len(parts)<2 or parts[0]!="api":return set()
    group=parts[1]; last=parts[-1]
    if group=="live-rooms":return set() if last=="leave" else {"live"}
    if group=="recordings":return {"recording"}
    if group=="action-items":return set() if method=="DELETE" else {"actions"}
    if group=="minute-formats":
        if method=="GET" and len(parts)==4 and parts[2]=="meeting":return set()
        return {"templates","ai"} if last=="generate" else {"templates"}
    if group=="summaries" and last=="generate":return {"ai"}
    if group=="meetings" and len(parts)>3:
        if last=="start":return {"live"}
        if last in {"transcribe","retry"}:return {"ai"}
        if last in {"export","finalize","final-minutes"} or parts[-2:]==["final-minutes","status"]:return {"exports"}
    if group=="system" and len(parts)>2 and parts[2] in {"audit","backups"}:return set() if method=="DELETE" else {"audit"}
    return set()
def allowed_when_expired(path,method):
    if method in {"GET","HEAD","OPTIONS"}:return True
    p=path.strip("/").split("/")
    return len(p)>2 and p[0]=="api" and (p[1]=="auth" or (p[1]=="live-rooms" and p[-1]=="leave") or (p[1]=="meetings" and p[-1]=="end") or (method=="DELETE" and (p[1] in {"staff","meetings","action-items"} or p[1:3]==["system","backups"])))
def monthly_key(now=None):
    return "__cc_ai_seconds_"+(now or datetime.now(timezone.utc)).strftime("%Y_%m")
