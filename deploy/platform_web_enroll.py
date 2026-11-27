"""One-time, operator-issued browser enrollment. Never expose a setup key to logs."""
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import stat
import time

import tenantctl
import platform_mfa

KEY_NAME="platform-enrollment-key"
COOKIE="__Host-minuteseal-enrollment"
KEY_TTL=1800
CHALLENGE_TTL=300

def _key(root):
    # Both absent and invalid records fail closed; never replace an administrator.
    record=root/"platform-password.json"
    if record.exists() or record.is_symlink():return None
    path=root/KEY_NAME
    try:
        fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
        with os.fdopen(fd,"rb") as handle:
            info=os.fstat(handle.fileno())
            if not stat.S_ISREG(info.st_mode) or info.st_uid!=os.geteuid() or info.st_mode&0o077:
                return None
            if not 0<=time.time()-info.st_mtime<=KEY_TTL or info.st_size>256:return None
            value=handle.read(256).decode("ascii").strip()
            return value if re.fullmatch(r"[A-Za-z0-9_-]{32,128}",value) else None
    except (OSError,UnicodeError):return None

def available(root):
    return _key(root) is not None

def digest(key):
    return hashlib.sha256(key.encode("ascii")).hexdigest()

def begin(root,key,password,password_record):
    if not re.fullmatch(r"[A-Za-z0-9_-]{32,128}",key):raise ValueError("Invalid key")
    with tenantctl.registry(root):
        expected=_key(root)
        if not expected or not hmac.compare_digest(digest(expected),digest(key)):raise ValueError("Invalid key")
        record=password_record(password)
    return {"nonce":secrets.token_urlsafe(32),"csrf":secrets.token_urlsafe(32),
            "secret":base64.b32encode(secrets.token_bytes(20)).decode(),
            "record":record,"digest":digest(key),"expires":time.monotonic()+CHALLENGE_TTL,"attempts":0}

def valid_challenge(challenge,nonce,csrf):
    return bool(challenge["expires"]>time.monotonic() and challenge["attempts"]<5
        and hmac.compare_digest(challenge["nonce"],nonce)
        and hmac.compare_digest(challenge["csrf"],csrf))

def finish(root,challenge,step):
    with tenantctl.registry(root):
        key=_key(root)
        if not key or not hmac.compare_digest(digest(key),challenge["digest"]) or challenge["expires"]<=time.monotonic():
            raise ValueError("Enrollment expired")
        record={**challenge["record"],"totp_secret":challenge["secret"],"last_step":step}
        tenantctl.private_write(root/"platform-password.json",json.dumps(record))
        # A committed administrator record also blocks all future enrollment.
        try:(root/KEY_NAME).unlink()
        except OSError:pass

def cookie(nonce,clear=False):
    return f"{COOKIE}={nonce}; Path=/; HttpOnly; SameSite=Strict; Secure"+("; Max-Age=0" if clear else "; Max-Age=300")
