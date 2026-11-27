"""Shared checkout inbox. Public process has no access to the private registry."""
import hashlib
import hmac
import json
import re
import secrets
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path

TOKEN=re.compile(r"[A-Za-z0-9_-]{43}")
PROVIDERS={"yo":"Yo! Uganda","iotec":"ioTec Pay"}
def digest(token):return hashlib.sha256(token.encode()).hexdigest()

@contextmanager
def db(path):
    path=Path(path)
    if not path.parent.is_dir() or path.is_symlink():raise RuntimeError("Checkout inbox unavailable")
    c=sqlite3.connect(path,timeout=10)
    c.row_factory=sqlite3.Row
    try:
        c.execute("""CREATE TABLE IF NOT EXISTS checkout(
            key TEXT PRIMARY KEY, invoice TEXT NOT NULL, view TEXT NOT NULL,
            expires INTEGER NOT NULL, status TEXT NOT NULL, intent TEXT,
            updated INTEGER NOT NULL)""")
        c.commit()
        yield c
        c.commit()
    except Exception:
        c.rollback()
        raise
    finally:c.close()

def public_view(inv,providers):
    return {"invoice":inv["id"],"organization":inv["customer"],"plan":inv["plan"],
            "amount":inv["amount_minor"],"currency":inv["currency"],"months":inv["months"],
            "providers":list(providers),"receipt":inv.get("receipt_id") if inv["status"]=="paid" else None,
            "expiry":inv.get("renewal",{}).get("new_expiry") if isinstance(inv.get("renewal"),dict) and inv["status"]=="paid" else None}

def publish(path,inv):
    meta=inv.get("customer_checkout")
    if not meta:return
    key=meta["key"]
    with db(path) as c:
        c.execute("BEGIN IMMEDIATE")
        old=c.execute("SELECT status,intent FROM checkout WHERE key=?",(key,)).fetchone()
        status=inv["status"]
        # An outstanding customer intent is preserved until the private worker handles it.
        if old and old["status"] in {"queued","review_required"} and status=="open":return
        c.execute("""INSERT INTO checkout(key,invoice,view,expires,status,intent,updated)
        VALUES(?,?,?,?,?,NULL,?) ON CONFLICT(key) DO UPDATE SET view=excluded.view,
        expires=excluded.expires,status=excluded.status,intent=NULL,updated=excluded.updated""",
        (key,inv["id"],json.dumps(public_view(inv,meta["providers"])),meta["expires"],status,int(time.time())))

def issue(path,inv,providers,*,now=None):
    if inv["status"]!="open" or inv["currency"]!="UGX" or inv.get("sandbox") or not providers or not set(providers)<=set(PROVIDERS):
        raise ValueError("Open UGX invoice and enabled payment provider required")
    if inv.get("customer_checkout"):raise ValueError("Checkout already issued; revoke before reissuing")
    token=secrets.token_urlsafe(32)
    inv["customer_checkout"]={"key":digest(token),"expires":int(time.time() if now is None else now)+7*86400,"providers":list(providers)}
    return token

def revoke(path,inv):
    meta=inv.get("customer_checkout")
    if not meta:return
    if inv["status"]!="open":raise ValueError("Cannot revoke a submitted collection")
    with db(path) as c:
        c.execute("BEGIN IMMEDIATE")
        old=c.execute("SELECT status FROM checkout WHERE key=?",(meta["key"],)).fetchone()
        if old and old["status"]=="queued":raise ValueError("Payment request already queued")
        c.execute("DELETE FROM checkout WHERE key=?",(meta["key"],))
    inv.pop("customer_checkout",None)

def read(path,token,now=None):
    if not TOKEN.fullmatch(token):return None
    with db(path) as c:
        row=c.execute("SELECT * FROM checkout WHERE key=?",(digest(token),)).fetchone()
        if not row or row["expires"]<int(time.time() if now is None else now):return None
        return {**json.loads(row["view"]),"status":row["status"]}

def normalize_phone(number):
    number=re.sub(r"[\s()+-]","",number)
    if re.fullmatch(r"07\d{8}",number):number="256"+number[1:]
    if not re.fullmatch(r"2567\d{8}",number):raise ValueError("Enter a valid Uganda mobile number")
    return number

def queue(path,token,provider,number,confirmed,now=None):
    if not TOKEN.fullmatch(token) or provider not in PROVIDERS or confirmed is not True:raise ValueError("Valid checkout and explicit consent required")
    number=normalize_phone(number)
    now=int(time.time() if now is None else now)
    with db(path) as c:
        c.execute("BEGIN IMMEDIATE")
        row=c.execute("SELECT * FROM checkout WHERE key=?",(digest(token),)).fetchone()
        if not row or row["expires"]<now or row["status"]!="open":raise ValueError("Checkout unavailable or already submitted")
        view=json.loads(row["view"])
        if provider not in view["providers"]:raise ValueError("Provider unavailable")
        intent={"token":token,"provider":provider,"phone":number,"consent":True,"amount":view["amount"],"currency":view["currency"],"created":now}
        c.execute("UPDATE checkout SET status='queued',intent=?,updated=? WHERE key=?",(json.dumps(intent),now,row["key"]))

def queued(path):
    with db(path) as c:
        return [dict(r) for r in c.execute("SELECT key,invoice,intent FROM checkout WHERE status='queued' ORDER BY updated LIMIT 50")]

def reject(path,key):
    with db(path) as c:
        c.execute("UPDATE checkout SET status='review_required',intent=NULL,updated=? WHERE key=? AND status='queued'",(int(time.time()),key))

def validate_intent(inv,item,now=None):
    meta=inv.get("customer_checkout",{})
    intent=json.loads(item["intent"])
    now=int(time.time() if now is None else now)
    token=intent.get("token","")
    if not TOKEN.fullmatch(token) or not hmac.compare_digest(digest(token),meta.get("key","")) or item["key"]!=meta["key"] or item["invoice"]!=inv["id"]:
        raise ValueError("Checkout identity mismatch")
    if inv["status"]!="open" or inv.get("sandbox") or inv["currency"]!="UGX" or meta["expires"]<now or not now-900<=intent["created"]<=now:
        raise ValueError("Checkout expired or unavailable")
    if intent["consent"] is not True or intent["provider"] not in meta["providers"] or intent["amount"]!=inv["amount_minor"] or intent["currency"]!=inv["currency"]:
        raise ValueError("Checkout authorization mismatch")
    return intent["provider"],normalize_phone(intent["phone"])
