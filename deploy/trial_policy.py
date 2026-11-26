"""Operator-controlled default trial length, independent of customer form data."""
from datetime import datetime,timezone,timedelta
import json
import tenantctl
import entitlements

def days(root):
    path=root/"trial-policy.json"
    if not path.exists():return 30
    if path.is_symlink() or path.stat().st_mode & 0o077:raise ValueError("Invalid trial policy file")
    value=json.loads(path.read_text())["days"]
    if type(value) is not int or not 1<=value<=365:raise ValueError("Invalid trial duration")
    return value

def configure(root,value):
    if type(value) is not int or not 1<=value<=365:raise ValueError("Trial duration must be 1–365 days.")
    tenantctl.private_write(root/"trial-policy.json",json.dumps({"days":value})+"\n")

def start(root,row,clock=None):
    p=row["profile"]
    if p.get("trial_started_at"):
        return
    clock=clock or datetime.now(timezone.utc)
    n=days(root)
    # Subscription expiry is inclusive in the existing entitlement engine.
    p.update(trial_started_at=clock.isoformat(timespec="seconds"),trial_days=n,
             expiry=(clock.date()+timedelta(days=n-1)).isoformat(),grace_days=0)
    entitlements.publish(root,row,p)
