"""Private operator TOTP enrollment, with persistent replay protection."""
import base64
import getpass
import hashlib
import hmac
import json
import re
import secrets
import struct
import sys
import time
import tenantctl

def totp(secret,step):
    key=base64.b32decode(secret)
    value=hmac.new(key,struct.pack(">Q",step),hashlib.sha1).digest()
    offset=value[-1]&15
    return f"{(struct.unpack('>I',value[offset:offset+4])[0]&0x7fffffff)%1000000:06d}"

def match(secret,code,last=-1,now=None):
    if not re.fullmatch(r"[0-9]{6}",code):return None
    step=int(time.time() if now is None else now)//30
    for candidate in (step,step-1,step+1):
        if candidate>=0 and candidate>last and hmac.compare_digest(totp(secret,candidate),code):
            return candidate
    return None

def read(root):
    path=root/"platform-password.json"
    if not path.exists():return None
    if path.is_symlink() or path.stat().st_mode&0o077:raise RuntimeError("Private operator record required")
    record=json.loads(path.read_text())
    if not re.fullmatch(r"[A-Z2-7]{32}",record.get("totp_secret","")) or type(record.get("last_step")) is not int:return None
    return record

def enrolled(root):
    return read(root) is not None

def verify(root,password,code,check_password):
    with tenantctl.registry(root):
        record=read(root)
        if not record or not check_password(password,record):return False
        step=match(record["totp_secret"],code,record["last_step"])
        if step is None:return False
        record["last_step"]=step
        tenantctl.private_write(root/"platform-password.json",json.dumps(record))
        return True

def enroll_interactive(root,password_record):
    if not sys.stdin.isatty() or not sys.stdout.isatty():
        raise SystemExit("Use an interactive trusted operator terminal.")
    with tenantctl.registry(root):
        if (root/"platform-password.json").exists():
            raise SystemExit("An operator record already exists; enrollment cannot overwrite it.")
        password=getpass.getpass("New platform password (16+ characters): ")
        if password!=getpass.getpass("Repeat platform password: "):
            raise SystemExit("Passwords do not match.")
        record=password_record(password)
        secret=base64.b32encode(secrets.token_bytes(20)).decode()
        print("Add a time-based account named MinuteSeal Platform in your authenticator (6 digits, 30 seconds, SHA-1).")
        print("Authenticator setup key: "+secret)
        step=match(secret,getpass.getpass("Current authenticator code: "))
        if step is None:raise SystemExit("Authenticator verification failed. Nothing was saved.")
        record.update(totp_secret=secret,last_step=step)
        tenantctl.private_write(root/"platform-password.json",json.dumps(record))
        print("Enrollment complete. Sign in with a fresh authenticator code.")
