"""Operator-only bridge between registration inbox and isolated workspaces."""
import os
import secrets
import time
from pathlib import Path
import onboarding
import tenantctl

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
    code=secrets.token_urlsafe(32)
    expires=int(time.time())+3600
    compose(root,row,["exec","-T","backend","python","-c",ISSUE_CODE,app["email"],onboarding.digest(code),str(expires)],timeout=45)
    sender(app["email"],"Set up your ConveneCore workspace",
           "Your organization workspace is ready for administrator setup.\n"
           "Open https://"+row["host"]+"/setup\nAdministrator email: "+app["email"]+
           "\nSingle-use setup code: "+code+"\nThe code expires in one hour. Set your own password there.")
    if app["status"]=="provisioned":
        onboarding.transition(path,ref,"provisioned","setup_sent",row["host"])
