"""Trusted OTP completion bridge; no client-provided organization or identity."""
import hmac,re,time
import onboarding

def complete(path,ref,key,code,allocator):
    if not onboarding.REF.fullmatch(ref) or not onboarding.TOKEN.fullmatch(key) or not re.fullmatch(r"[0-9]{6}",code):return None
    with onboarding.database(path) as db:
        db.execute("BEGIN IMMEDIATE")
        row=onboarding.browser_row(db,ref,key)
        if not row or row["status"]!="unverified" or row["expires"]<int(time.time()) or row["attempts"]>=5:return None
        if not hmac.compare_digest(onboarding.otp_digest(ref,key,code),row["verify_hash"] or ""):
            db.execute("UPDATE browser_otp SET attempts=attempts+1 WHERE ref=?",(ref,))
            return None
        password=db.execute("SELECT password_hash FROM registration_passwords WHERE ref=?",(ref,)).fetchone()
        if not password:raise RuntimeError("Missing registration credential")
        app=dict(row);app["status"]="verified"
        token=allocator.allocate(app,password[0])
        if not onboarding.TOKEN.fullmatch(token):raise RuntimeError("Invalid session")
        db.execute("UPDATE applications SET status='activated',verify_hash=NULL,status_hash='',host=NULL,updated=? WHERE ref=?",(int(time.time()),ref))
        db.execute("DELETE FROM registration_passwords WHERE ref=?",(ref,))
        db.execute("DELETE FROM browser_otp WHERE ref=?",(ref,))
        return token
