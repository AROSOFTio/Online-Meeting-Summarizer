"""Public registration inbox. No tenant registry, Docker, or workspace credentials."""
import hashlib
import hmac
import os
import re
import secrets
import smtplib
import sqlite3
import ssl
import time
from contextlib import contextmanager
from email.message import EmailMessage
from pathlib import Path

SECTORS=("Education","Government","Healthcare","Corporate","NGO & nonprofit","Association","Community","Research","Faith-based","Other")
PLANS=("starter","professional","enterprise","custom")
SLUG=re.compile(r"[a-z][a-z0-9-]{1,39}")
EMAIL=re.compile(r"[A-Za-z0-9.!#$%&'*+/=?^_\x60{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}")
REF=re.compile(r"[a-f0-9]{32}")
TOKEN=re.compile(r"[A-Za-z0-9_-]{43}")
TTL=86400

def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()

def matches(value, stored):
    return bool(TOKEN.fullmatch(value) and stored and hmac.compare_digest(digest(value),stored))

def validate(data):
    name=str(data.get("name","")).strip()
    contact=str(data.get("contact","")).strip()
    email=str(data.get("email","")).strip().lower()
    slug=str(data.get("slug","")).strip().lower()
    sector=data.get("sector")
    plan=data.get("plan")
    if not 2<=len(name)<=150 or not 2<=len(contact)<=100 or any(ord(c)<32 for c in name+contact):
        raise ValueError("Enter a valid organization and contact name.")
    if len(email)>254 or not EMAIL.fullmatch(email) or ".." in email:
        raise ValueError("Enter a valid email address.")
    if not SLUG.fullmatch(slug) or sector not in SECTORS or plan not in PLANS:
        raise ValueError("Choose a valid workspace identifier, organization type and plan.")
    return dict(name=name,contact=contact,email=email,slug=slug,sector=sector,plan=plan)

@contextmanager
def database(path):
    path=Path(path)
    # The operator pre-creates this directory/file with restricted permissions.
    if not path.parent.is_dir() or path.is_symlink():
        raise RuntimeError("Registration inbox is not configured.")
    conn=sqlite3.connect(path,timeout=10)
    conn.row_factory=sqlite3.Row
    try:
        conn.execute("""CREATE TABLE IF NOT EXISTS applications(
            ref TEXT PRIMARY KEY, name TEXT NOT NULL, contact TEXT NOT NULL,
            email TEXT NOT NULL, slug TEXT NOT NULL, sector TEXT NOT NULL, plan TEXT NOT NULL,
            status TEXT NOT NULL, verify_hash TEXT, status_hash TEXT NOT NULL,
            expires INTEGER NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL,
            last_sent INTEGER NOT NULL, sends INTEGER NOT NULL, host TEXT)""")
        conn.execute("""CREATE TABLE IF NOT EXISTS mail_attempts(
            email TEXT NOT NULL, attempted INTEGER NOT NULL)""")
        conn.execute("CREATE TABLE IF NOT EXISTS browser_otp(ref TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0)")
        conn.execute("CREATE TABLE IF NOT EXISTS registration_passwords(ref TEXT PRIMARY KEY, password_hash TEXT NOT NULL)")
        conn.commit()
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def mail(recipient, subject, body):
    if not EMAIL.fullmatch(recipient):
        raise ValueError("Invalid recipient.")
    host=os.environ.get("CC_ONBOARD_SMTP_HOST","")
    sender=os.environ.get("CC_ONBOARD_SMTP_FROM","")
    if not host or not EMAIL.fullmatch(sender):
        raise RuntimeError("Onboarding email delivery is not configured.")
    port=int(os.environ.get("CC_ONBOARD_SMTP_PORT","465"))
    msg=EmailMessage()
    msg["From"]=sender
    msg["To"]=recipient
    msg["Subject"]=subject
    msg.set_content(body)
    context=ssl.create_default_context()
    if port==465:
        client=smtplib.SMTP_SSL(host,port,context=context,timeout=15)
    else:
        client=smtplib.SMTP(host,port,timeout=15)
    with client:
        if port!=465:
            client.ehlo()
            client.starttls(context=context)
            client.ehlo()
        username=os.environ.get("CC_ONBOARD_SMTP_USER","")
        if username:
            client.login(username,os.environ.get("CC_ONBOARD_SMTP_PASSWORD",""))
        refused=client.send_message(msg)
        if refused:
            raise RuntimeError("Email delivery rejected.")

def reserve_mail(conn,email,now):
    conn.execute("DELETE FROM mail_attempts WHERE attempted<?",(now-TTL,))
    total=conn.execute("SELECT count(*) FROM mail_attempts WHERE attempted>=?",(now-3600,)).fetchone()[0]
    per=conn.execute("SELECT count(*) FROM mail_attempts WHERE email=?",(email,)).fetchone()[0]
    if total>=30 or per>=5:
        raise ValueError("Email request limit reached. Try again later.")
    conn.execute("INSERT INTO mail_attempts VALUES (?,?)",(email,now))

def send_verification(row,code,origin,sender):
    sender(row["email"],"Verify your MinuteSeal registration",
        "To verify your email, open "+origin+"/verify\n"
        "Registration reference: "+row["ref"]+"\nVerification code: "+code+
        "\nThis code expires in 24 hours and can only be used once. "
        "If you did not request registration, ignore this email.")

def register(path,data,origin,sender=mail):
    data=validate(data)
    now=int(time.time())
    ref=secrets.token_hex(16)
    code=secrets.token_urlsafe(32)
    status_key=secrets.token_urlsafe(32)
    with database(path) as conn:
        conn.execute("BEGIN IMMEDIATE")
        conn.execute("DELETE FROM applications WHERE status=\'unverified\' AND created<?",(now-7*TTL,))
        if conn.execute("SELECT count(*) FROM applications WHERE status=\'unverified\'").fetchone()[0]>=1000:
            raise ValueError("Registration queue is temporarily full. Try again later.")
        reserve_mail(conn,data["email"],now)
        # Do not expose whether someone else has requested this workspace.
        conn.execute("""INSERT INTO applications
            (ref,name,contact,email,slug,sector,plan,status,verify_hash,status_hash,expires,created,updated,last_sent,sends)
            VALUES (?,?,?,?,?,?,?,'unverified',?,?,?,?,?,?,1)""",
            (ref,data["name"],data["contact"],data["email"],data["slug"],data["sector"],data["plan"],
             digest(code),digest(status_key),now+TTL,now,now,now))
    delivered=True
    try:
        send_verification({**data,"ref":ref},code,origin,sender)
    except Exception:
        delivered=False
    return ref,status_key,delivered

def verify(path,ref,code):
    if not REF.fullmatch(ref) or not TOKEN.fullmatch(code):
        return False
    now=int(time.time())
    with database(path) as conn:
        conn.execute("BEGIN IMMEDIATE")
        row=conn.execute("SELECT * FROM applications WHERE ref=?",(ref,)).fetchone()
        if not row or row["status"]!="unverified" or row["expires"]<now or not matches(code,row["verify_hash"]):
            return False
        conn.execute("UPDATE applications SET status='verified',verify_hash=NULL,updated=? WHERE ref=?",(now,ref))
        return True

def get_status(path,ref,key):
    if not REF.fullmatch(ref) or not TOKEN.fullmatch(key):
        return None
    with database(path) as conn:
        row=conn.execute("SELECT * FROM applications WHERE ref=?",(ref,)).fetchone()
        if not row or not matches(key,row["status_hash"]):
            return None
        return {"status":row["status"],"host":row["host"] if row["status"]=="setup_sent" else None}

def resend(path,ref,key,origin,sender=mail):
    if not REF.fullmatch(ref) or not TOKEN.fullmatch(key):
        return False
    now=int(time.time())
    code=secrets.token_urlsafe(32)
    with database(path) as conn:
        conn.execute("BEGIN IMMEDIATE")
        row=conn.execute("SELECT * FROM applications WHERE ref=?",(ref,)).fetchone()
        if not row or not matches(key,row["status_hash"]) or row["status"]!="unverified" or now-row["last_sent"]<60 or row["sends"]>=5:
            return False
        reserve_mail(conn,row["email"],now)
        conn.execute("UPDATE applications SET verify_hash=?,expires=?,last_sent=?,sends=sends+1,updated=? WHERE ref=?",
                     (digest(code),now+TTL,now,now,ref))
    try:
        send_verification(row,code,origin,sender)
        return True
    except Exception:
        return False

def inbox(path):
    with database(path) as conn:
        return [dict(r) for r in conn.execute("""SELECT ref,name,contact,email,slug,sector,plan,status,host,created
            FROM applications WHERE status IN ('verified','provisioned','setup_sent','activated','rejected')
            ORDER BY created DESC LIMIT 200""")]

def application(path,ref):
    if not REF.fullmatch(ref):
        raise ValueError("Invalid reference.")
    with database(path) as conn:
        row=conn.execute("""SELECT ref,name,contact,email,slug,sector,plan,status,host FROM applications WHERE ref=?""",(ref,)).fetchone()
        if not row:
            raise ValueError("Application not found.")
        return dict(row)

def transition(path,ref,old,new,host=None):
    allowed={("verified","provisioned"),("verified","rejected"),("provisioned","setup_sent")}
    if (old,new) not in allowed:
        raise ValueError("Invalid registration transition.")
    with database(path) as conn:
        conn.execute("BEGIN IMMEDIATE")
        changed=conn.execute("UPDATE applications SET status=?,host=?,updated=? WHERE ref=? AND status=?",
                             (new,host,int(time.time()),ref,old)).rowcount
        if changed!=1:
            raise ValueError("Registration state changed.")
        if new=="rejected":conn.execute("DELETE FROM registration_passwords WHERE ref=?",(ref,))

# Opaque session credentials stay in the browser cookie, not the customer UI.
OTP_TTL=600
def otp_digest(ref,key,code):
    return hmac.new(key.encode("ascii"),("minuteseal-otp:"+ref+":"+code).encode("ascii"),hashlib.sha256).hexdigest()

def otp_mail(email,code,sender):
    sender(email,"Your MinuteSeal verification code","Your MinuteSeal verification code is "+code+". It expires in 10 minutes. If you did not register, ignore this email.")

def password_for_registration(data):
    # The cleartext password exists only for the lifetime of this request.
    from argon2 import PasswordHasher
    password=data.get("password","")
    if not isinstance(password,str) or not 8<=len(password)<=128 or not re.search(r"[A-Z]",password) or not re.search(r"[a-z]",password) or not re.search(r"[^A-Za-z0-9]",password):
        raise ValueError("Use 8–128 characters, uppercase, lowercase and a special character.")
    if password!=data.get("confirm_password"):
        raise ValueError("Passwords do not match.")
    return PasswordHasher().hash(password)

def pending_password(path,ref):
    # Only called by the trusted operator bridge; never return this from HTTP.
    if not REF.fullmatch(ref):return None
    with database(path) as conn:
        row=conn.execute("SELECT p.password_hash FROM registration_passwords p JOIN applications a ON a.ref=p.ref WHERE p.ref=? AND a.status IN ('verified','provisioned')",(ref,)).fetchone()
        return row[0] if row else None

def finish_registration(path,ref,host):
    with database(path) as conn:
        conn.execute("BEGIN IMMEDIATE")
        changed=conn.execute("UPDATE applications SET status='activated',updated=? WHERE ref=? AND status='provisioned' AND host=?",(int(time.time()),ref,host)).rowcount
        if changed!=1:
            row=conn.execute("SELECT status,host FROM applications WHERE ref=?",(ref,)).fetchone()
            if not row or row["status"]!="activated" or row["host"]!=host:raise ValueError("Registration state changed.")
        conn.execute("DELETE FROM registration_passwords WHERE ref=?",(ref,))

def register_browser(path,data,sender=mail):
    password_hash=password_for_registration(data)
    # Assign a unique internal workspace identifier; no customer naming step.
    if not data.get("slug"):
        stem=re.sub(r"[^a-z0-9]+","-",str(data.get("name","")).lower()).strip("-")[:28].rstrip("-")
        if not stem or not stem[0].isalpha():stem="org-"+stem
        data={**data,"slug":stem[:28].rstrip("-")+"-"+secrets.token_hex(4),"plan":"starter"}
    data=validate(data)
    now=int(time.time())
    ref=secrets.token_hex(16)
    key=secrets.token_urlsafe(32)
    code=f"{secrets.randbelow(1000000):06d}"
    with database(path) as conn:
        conn.execute("BEGIN IMMEDIATE")
        conn.execute("DELETE FROM applications WHERE status='unverified' AND created<?",(now-7*TTL,))
        conn.execute("DELETE FROM browser_otp WHERE ref NOT IN (SELECT ref FROM applications)")
        conn.execute("DELETE FROM registration_passwords WHERE ref NOT IN (SELECT ref FROM applications)")
        if conn.execute("SELECT count(*) FROM applications WHERE status='unverified'").fetchone()[0]>=1000:
            raise ValueError("Registration queue is temporarily full. Try again later.")
        reserve_mail(conn,data["email"],now)
        conn.execute("""INSERT INTO applications
            (ref,name,contact,email,slug,sector,plan,status,verify_hash,status_hash,expires,created,updated,last_sent,sends)
            VALUES (?,?,?,?,?,?,?,'unverified',?,?,?,?,?,?,1)""",
            (ref,data["name"],data["contact"],data["email"],data["slug"],data["sector"],data["plan"],
             otp_digest(ref,key,code),digest(key),now+OTP_TTL,now,now,now))
        conn.execute("INSERT INTO browser_otp(ref,attempts) VALUES (?,0)",(ref,))
        conn.execute("INSERT INTO registration_passwords(ref,password_hash) VALUES (?,?)",(ref,password_hash))
    try:
        otp_mail(data["email"],code,sender)
        sent=True
    except Exception:
        sent=False
    return ref,key,sent

def browser_row(conn,ref,key):
    if not REF.fullmatch(ref) or not TOKEN.fullmatch(key):return None
    row=conn.execute("SELECT a.*, b.attempts FROM applications a JOIN browser_otp b ON a.ref=b.ref WHERE a.ref=?",(ref,)).fetchone()
    if not row or not matches(key,row["status_hash"]):return None
    return row

def browser_state(path,ref,key):
    if not REF.fullmatch(ref) or not TOKEN.fullmatch(key):return None
    with database(path) as conn:
        row=browser_row(conn,ref,key)
        return dict(status=row["status"],email=row["email"],host=row["host"] if row["status"] in ("setup_sent","activated") else None) if row else None

def verify_browser(path,ref,key,code):
    if not re.fullmatch(r"[0-9]{6}",code):return False
    now=int(time.time())
    with database(path) as conn:
        conn.execute("BEGIN IMMEDIATE")
        row=browser_row(conn,ref,key)
        if not row or row["status"]!="unverified" or row["expires"]<now or row["attempts"]>=5:return False
        if not hmac.compare_digest(otp_digest(ref,key,code),row["verify_hash"] or ""):
            conn.execute("UPDATE browser_otp SET attempts=attempts+1 WHERE ref=?",(ref,))
            return False
        conn.execute("UPDATE applications SET status='verified',verify_hash=NULL,updated=? WHERE ref=?",(now,ref))
        return True

def resend_browser(path,ref,key,sender=mail):
    now=int(time.time())
    code=f"{secrets.randbelow(1000000):06d}"
    with database(path) as conn:
        conn.execute("BEGIN IMMEDIATE")
        row=browser_row(conn,ref,key)
        if not row or row["status"]!="unverified" or now-row["last_sent"]<60 or row["sends"]>=5:return False
        reserve_mail(conn,row["email"],now)
        conn.execute("UPDATE applications SET verify_hash=?,expires=?,last_sent=?,sends=sends+1,updated=? WHERE ref=?",
                     (otp_digest(ref,key,code),now+OTP_TTL,now,now,ref))
        conn.execute("UPDATE browser_otp SET attempts=0 WHERE ref=?",(ref,))
    try:
        otp_mail(row["email"],code,sender)
        return True
    except Exception:
        return False
