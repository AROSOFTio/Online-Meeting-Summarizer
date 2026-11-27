"""Operator-only bridge between registration inbox and isolated workspaces."""
import os
import secrets
import time
from pathlib import Path
import onboarding
import tenantctl
import entitlements
import trial_policy
import json
import subprocess

ISSUE_CODE="""import sys
from app.core.database import SessionLocal
from app.core.tenant_boundary import bind_or_verify_database,bind_or_verify_storage
from app.core.initial_setup import issue
db=SessionLocal()
try:
    bind_or_verify_database(db)
    bind_or_verify_storage()
    issue(db,sys.argv[1],sys.argv[2],int(sys.argv[3]))
finally:
    db.close()
"""

def inbox_path():
    value=os.environ.get("CC_ONBOARD_INBOX")
    return Path(value) if value else None

def approve(path,root,rows,ref,host,port,profile_factory,plans,features):
    app=onboarding.application(path,ref)
    if app["status"]!="verified":
        raise ValueError("Only email-verified applications can be approved.")
    clean=onboarding.validate(app)
    row=rows.get(clean["slug"])
    if row:
        if row.get("registration_ref")!=ref or row["host"]!=host or row["port"]!=port:
            raise ValueError("Workspace already reserved.")
    else:
        row=tenantctl.provision(root,rows,clean["slug"],host,clean["email"],port,clean["name"],clean["contact"])
        row["registration_ref"]=ref
        row["profile"]={**profile_factory(row),"name":clean["name"],"sector":clean["sector"],
                        "plan":clean["plan"],"limits":dict(plans[clean["plan"]]),"features":list(features)}
        entitlements.publish(root,row)
        # Persist registry before marking inbox approved; retry can reconcile a partial commit.
        tenantctl.private_write(root/"registry.json",__import__("json").dumps(rows,indent=2)+"\n")
    onboarding.transition(path,ref,"verified","provisioned",host)
    return row

def send_setup(path,root,row,compose,sender=onboarding.mail):
    ref=row.get("registration_ref")
    if not ref or not row.get("enabled"):
        raise ValueError("Start the approved workspace before sending setup.")
    app=onboarding.application(path,ref)
    if app["status"] not in {"provisioned","setup_sent"} or app["email"]!=row["admin_email"] or app["host"]!=row["host"]:
        raise ValueError("Application and workspace do not match.")
    if finish_password(path,root,row,sender):return True
    code=secrets.token_urlsafe(32)
    expires=int(time.time())+3600
    compose(root,row,["exec","-T","backend","python","-c",ISSUE_CODE,app["email"],onboarding.digest(code),str(expires)],timeout=45)
    sender(app["email"],"Set up your MinuteSeal workspace",
           "Your organization workspace is ready for administrator setup.\n"
           "Open https://"+row["host"]+"/setup\nAdministrator email: "+app["email"]+
           "\nSingle-use setup code: "+code+"\nThe code expires in one hour. Set your own password there.")
    if app["status"]=="provisioned":
        onboarding.transition(path,ref,"provisioned","setup_sent",row["host"])

# This code only runs inside the newly provisioned tenant, never in the public
# registration process. The Argon2 hash is passed over stdin, not process args.
ACTIVATE_PASSWORD_CODE = """import json,sys,hmac,re
from app.core.database import SessionLocal
from app.core.config import settings
from app.core.tenant_boundary import bind_or_verify_database,bind_or_verify_storage
from app.models.models import User,UserRole,SystemSetting
from app.core.initial_setup import KEY
data=json.load(sys.stdin)
assert data["tenant"]==settings.TENANT_ID and data["email"]==str(settings.ADMIN_EMAIL)
password_hash=data["password_hash"]
if not re.fullmatch(r"[$]argon2id[$]v=19[$]m=65536,t=3,p=4[$][A-Za-z0-9+/]{22}[$][A-Za-z0-9+/]{43}",password_hash):
    raise ValueError("Invalid registration password hash")
with SessionLocal() as db:
    bind_or_verify_database(db);bind_or_verify_storage()
    user=db.query(User).filter(User.email==data["email"]).with_for_update().first()
    if not user or user.role!=UserRole.admin or not user.is_active:raise ValueError("Initial administrator not eligible")
    if not user.must_change_password:
        if not hmac.compare_digest(user.hashed_password,password_hash):raise ValueError("Administrator is already initialized")
    else:
        user.hashed_password=password_hash
        user.must_change_password=False
        db.query(SystemSetting).filter(SystemSetting.key==KEY).delete(synchronize_session=False)
        db.commit()
print("Initial administrator ready")
"""

def install_registration_password(root,row,password_hash):
    tenantctl.validate(row["slug"],row["host"],row["admin_email"],row["port"])
    env={k:os.environ[k] for k in ("PATH","HOME","LANG","LC_ALL","DOCKER_HOST","DOCKER_CONTEXT","DOCKER_CONFIG","XDG_RUNTIME_DIR") if k in os.environ}
    result=subprocess.run(tenantctl.compose_command(root,row,"exec","-T","backend","python","-c",ACTIVATE_PASSWORD_CODE),
                          cwd=tenantctl.REPO,env=env,input=json.dumps({"tenant":row["slug"],"email":row["admin_email"],"password_hash":password_hash}),
                          text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=45)
    if result.returncode or "Initial administrator ready" not in result.stdout:
        raise RuntimeError("Initial administrator could not be activated.")

def finish_password(path,root,row,sender=onboarding.mail,rows=None):
    ref=row.get("registration_ref")
    if not ref or not row.get("enabled"):raise ValueError("Workspace must be running.")
    app=onboarding.application(path,ref)
    if app["status"]=="activated":return True
    if app["status"]!="provisioned" or app["email"]!=row["admin_email"] or app["host"]!=row["host"] or app["slug"]!=row["slug"]:
        raise ValueError("Application and workspace do not match.")
    password_hash=onboarding.pending_password(path,ref)
    if not password_hash:return False
    # Start the trial only when the workspace is running and its HTTPS route is ready.
    install_registration_password(root,row,password_hash)
    trial_policy.start(root,row)
    if rows is not None:tenantctl.private_write(root/"registry.json",json.dumps(rows,indent=2)+"\n")
    onboarding.finish_registration(path,ref,row["host"])
    try:
        sender(app["email"],"Your MinuteSeal organization is ready","Sign in at https://"+row["host"]+"/login using the password you chose during registration.")
    except Exception:
        pass
    return True
