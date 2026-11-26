#!/usr/bin/env python3
"""MinuteSeal operator console. Loopback listener behind a dedicated HTTPS origin."""
import argparse
import platform_mfa
import platform_web_enroll as web_enroll
import getpass
import hashlib
import hmac
import html
import json
import os
import re
import secrets
import subprocess
import time
from datetime import date, datetime, timezone, timedelta
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import tenantctl
import entitlements
import billing
import checkout
import payment_gateways as pg
import onboarding
import operator_onboarding
import trial_policy

SECTORS=("Education","Government","Healthcare","Corporate","NGO & nonprofit","Association","Community","Research","Faith-based","Other")
FEATURES={"live":"Live meetings","recording":"Recording uploads","ai":"AI transcription & minutes","templates":"Custom minute formats","exports":"PDF & Word exports","actions":"Action tracking","audit":"Audit and backups"}
PLANS={
    "starter": {"users":10,"storage_gib":5,"ai_minutes":300},
    "professional": {"users":50,"storage_gib":50,"ai_minutes":3000},
    "enterprise": {"users":250,"storage_gib":250,"ai_minutes":15000},
    "custom": {"users":25,"storage_gib":20,"ai_minutes":1000},
}
SESSION_SECONDS=1800
COOKIE="cc_platform_session"
MAX_BODY=16384

METRICS_CODE = """
import json, os
from datetime import datetime, timezone
from sqlalchemy import func
from app.core.config import settings
from app.core.database import SessionLocal
from app.core.tenant_boundary import bind_or_verify_database, bind_or_verify_storage
from app.models.models import User, Meeting, Recording, ProcessingJob
from app.core.subscriptions import snapshot
db=SessionLocal()
try:
    bind_or_verify_database(db)
    bind_or_verify_storage()
    now=datetime.now(timezone.utc)
    month=now.replace(day=1,hour=0,minute=0,second=0,microsecond=0)
    storage=0
    for root,dirs,files in os.walk(settings.STORAGE_DIR,followlinks=False):
        for filename in files:
            p=os.path.join(root,filename)
            if not os.path.islink(p):
                storage+=os.path.getsize(p)
    result={"active_users":db.query(User).filter(User.is_active.is_(True)).count(),
            "meetings":db.query(Meeting).count(),
            "recorded_seconds":float(db.query(func.sum(Recording.duration_seconds)).scalar() or 0),
            "storage_bytes":storage,
            "jobs_this_month":db.query(ProcessingJob).filter(ProcessingJob.created_at>=month).count()}
    entitlement=snapshot(db)
    result["storage_bytes"]=entitlement.get("usage",{}).get("storage_bytes",storage)
    result["ai_seconds"]=entitlement.get("usage",{}).get("ai_seconds",0)
    print(json.dumps(result))
finally:
    db.close()
"""

def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def esc(value):
    return html.escape(str(value),quote=True)


def one(form,key,default=""):
    return form.get(key,[default])[0]


def defaults(row):
    return {"name":row["slug"].replace("-"," ").title(),"sector":"Other",
            "plan":"starter","expiry":"","grace_days":0,"features":list(FEATURES),
            "limits":dict(PLANS["starter"]),"usage":None,
            "lifecycle":"running" if row.get("enabled") else "not started"}


def profile(row):
    return {**defaults(row),**row.get("profile",{})}


def clean_profile(form):
    name=one(form,"name").strip()
    sector=one(form,"sector")
    plan=one(form,"plan")
    expiry=one(form,"expiry")
    if not name or len(name)>150 or sector not in SECTORS or plan not in PLANS:
        raise ValueError("Enter a valid organization name, sector and plan.")
    if expiry:
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}",expiry):
            raise ValueError("Use a valid expiry date.")
        date.fromisoformat(expiry)
    grace=int(one(form,"grace_days","0"))
    if not 0<=grace<=30:raise ValueError("Grace must be 0–30 days.")
    limits={}
    for key,maximum in (("users",100000),("storage_gib",1000000),("ai_minutes",10000000)):
        value=int(one(form,key))
        if not 1<=value<=maximum:
            raise ValueError("Quota is outside the supported range.")
        limits[key]=value
    features=form.get("features",[])
    if any(k not in FEATURES for k in features):
        raise ValueError("Unknown feature.")
    return {"name":name,"sector":sector,"plan":plan,"expiry":expiry,"grace_days":grace,
            "limits":limits,"features":[k for k in FEATURES if k in features]}


def safe_compose(root,row,args,timeout=900):
    # Only predefined commands and a registered, validated organization.
    tenantctl.validate(row["slug"],row["host"],row["admin_email"],row["port"])
    env={k:os.environ[k] for k in ("PATH","HOME","LANG","LC_ALL","DOCKER_HOST","DOCKER_CONTEXT","DOCKER_CONFIG","XDG_RUNTIME_DIR") if k in os.environ}
    result=subprocess.run(tenantctl.compose_command(root,row,*args),cwd=tenantctl.REPO,env=env,
                          stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,timeout=timeout)
    if result.returncode:
        raise RuntimeError("Workspace command failed. Inspect its service status using the operator CLI.")
    return result.stdout


def collect_usage(root,row):
    raw=safe_compose(root,row,["exec","-T","backend","python","-c",METRICS_CODE],timeout=45)
    data=json.loads(raw.strip().splitlines()[-1])
    keys=("active_users","meetings","recorded_seconds","storage_bytes","jobs_this_month","ai_seconds")
    if any(type(data.get(k)) not in (int,float) or not 0<=data[k]<10**18 for k in keys):
        raise RuntimeError("Invalid aggregate metrics.")
    return {**{k:data[k] for k in keys},"collected_at":now()}


def audit(root,action,slug,outcome):
    event={"timestamp":now(),"actor":"platform-operator","action":action,"organization":slug,"outcome":outcome}
    fd=os.open(root/"platform-audit.jsonl",os.O_WRONLY|os.O_APPEND|os.O_CREAT,0o600)
    with os.fdopen(fd,"a") as handle:
        handle.write(json.dumps(event)+"\n")


def audit_tail(root,limit=30):
    path=root/"platform-audit.jsonl"
    if not path.exists():
        return []
    # Bound work even if audit history is large.
    with path.open("rb") as handle:
        handle.seek(0,2)
        size=handle.tell()
        handle.seek(max(0,size-65536))
        lines=handle.read().splitlines()
    events=[]
    for line in lines[-limit:]:
        try:
            events.append(json.loads(line))
        except (ValueError,UnicodeError):
            continue
    return list(reversed(events))


def dispatch(root,rows,form):
    action=one(form,"action")
    slug=one(form,"slug").strip()
    if action not in {"provision","configure","activate","suspend","refresh"}:
        raise ValueError("Unknown operation.")
    if not tenantctl.SLUG.fullmatch(slug):
        raise ValueError("Invalid organization identifier.")
    if action=="provision":
        configured=clean_profile(form)
        port=int(one(form,"port"))
        row=tenantctl.provision(root,rows,slug,one(form,"host").strip().lower(),one(form,"email").strip().lower(),port)
        row["profile"]={**defaults(row),**configured}
        entitlements.publish(root,row)
        audit(root,action,slug,"success")
        return "Organization provisioned. DNS, TLS and secure credential delivery are still required."
    row=rows.get(slug)
    if not row:
        raise ValueError("Unknown organization.")
    p=profile(row)
    row["profile"]=p
    try:
        if action=="configure":
            updated=clean_profile(form)
            if one(form,"apply_preset")=="yes":
                updated["limits"]=dict(PLANS[updated["plan"]])
            entitlements.publish(root,row,{**p,**updated})
            p.update(updated)
        elif action=="activate":
            if p["expiry"] and date.fromisoformat(p["expiry"])+timedelta(days=p.get("grace_days",0))<datetime.now(timezone.utc).date():
                raise ValueError("Subscription expiry is in the past. Update the configuration first.")
            entitlements.publish(root,row,p)
            safe_compose(root,row,["up","-d","--build","--wait"])
            row["enabled"]=True
            p["lifecycle"]="running"
        elif action=="suspend":
            safe_compose(root,row,["stop"])
            row["enabled"]=False
            p["lifecycle"]="suspended"
        elif action=="refresh":
            if not row.get("enabled"):
                raise ValueError("Start the workspace before collecting usage.")
            p["usage"]=collect_usage(root,row)
        audit(root,action,slug,"success")
    except ValueError:
        audit(root,action,slug,"rejected")
        return "Operation rejected. Check subscription dates, configuration and workspace state."
    except Exception:
        if action in {"activate","suspend"}:
            p["lifecycle"]="unknown — reconcile"
        audit(root,action,slug,"failed")
        return "Operation failed. Verify the tenant with tenantctl before retrying; no success is assumed."
    return {"configure":"Subscription policy saved. Upgraded workspaces read updates automatically.",
            "activate":"Workspace started. Public DNS/TLS and reverse-proxy routing are managed separately.",
            "suspend":"Workspace stopped; data retained. Reconcile reverse-proxy configuration separately.",
            "refresh":"Aggregate usage snapshot updated."}[action]


def password_record(password):
    if len(password)<16 or len(password)>256:
        raise ValueError("Use a platform password of 16–256 characters.")
    salt=secrets.token_bytes(16)
    digest=hashlib.scrypt(password.encode(),salt=salt,n=2**14,r=8,p=1,dklen=32)
    return {"salt":salt.hex(),"digest":digest.hex()}


def check_password(password,record):
    if not isinstance(password,str) or len(password)>256:
        return False
    try:
        digest=hashlib.scrypt(password.encode(),salt=bytes.fromhex(record["salt"]),n=2**14,r=8,p=1,dklen=32)
        return hmac.compare_digest(digest,bytes.fromhex(record["digest"]))
    except (KeyError,ValueError,TypeError):
        return False


def field(label,name,value="",kind="text",required=True):
    return f'<label>{esc(label)}<input name="{esc(name)}" type="{esc(kind)}" value="{esc(value)}" {"required" if required else ""}></label>'


def dropdown(label,name,items,selected):
    return f'<label>{esc(label)}<select name="{esc(name)}">'+''.join(f'<option value="{esc(k)}" {"selected" if k==selected else ""}>{esc(v)}</option>' for k,v in items)+'</select></label>'


def hidden(name,value):
    return f'<input type="hidden" name="{esc(name)}" value="{esc(value)}">'


def form_start(csrf,action,slug=""):
    return '<form method="post" action="/action">'+hidden("csrf",csrf)+hidden("action",action)+(hidden("slug",slug) if slug else "")


def settings_fields(p):
    limits=p["limits"]
    out=field("Organization name","name",p["name"])+dropdown("Organization type","sector",[(s,s) for s in SECTORS],p["sector"])
    out+=dropdown("Subscription plan","plan",[(s,s.title()) for s in PLANS],p["plan"])
    out+=field("Subscription expiry (UTC)","expiry",p["expiry"],"date",False)
    out+=field("Grace period (days)","grace_days",p.get("grace_days",0),"number")
    for label,key in (("User limit","users"),("Storage quota (GiB)","storage_gib"),("Monthly AI minutes allowance","ai_minutes")):
        out+=field(label,key,limits[key],"number")
    out+='<div class="wide"><span class="label">Configured features</span><div class="checks">'+''.join(f'<label class="check"><input type="checkbox" name="features" value="{esc(k)}" {"checked" if k in p["features"] else ""}> {esc(v)}</label>' for k,v in FEATURES.items())+'</div></div>'
    return out


CSS="""
*{box-sizing:border-box}body{margin:0;background:#f5f7fb;color:#182438;font:14px system-ui,sans-serif}a{color:#2459c4}header{background:#13253e;color:#fff;padding:18px 4%;display:flex;align-items:center;justify-content:space-between}header strong{font-size:20px;letter-spacing:-.4px}header small{color:#bdccdf}main{max-width:1400px;margin:auto;padding:32px 4%}h1{font-size:28px;margin:0 0 5px}h2{font-size:18px;margin:0 0 15px}p{line-height:1.5}.muted{color:#64748b}.notice{border:1px solid #d8e1ed;background:#fff;padding:13px;border-radius:8px;margin:14px 0}.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin:22px 0}.stat,.panel{background:white;border:1px solid #dce3ed;border-radius:10px;padding:20px}.stat b{display:block;font-size:28px;margin-top:6px}.panel{margin:18px 0}.toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.scroll{overflow:auto}table{width:100%;border-collapse:collapse;min-width:780px}th,td{text-align:left;padding:12px 10px;border-bottom:1px solid #e5eaf0;vertical-align:top}th{font-size:12px;color:#53647a;background:#f6f8fb}td small{display:block;color:#64748b;margin-top:4px}.pill{display:inline-block;padding:5px 9px;border-radius:20px;background:#edf1f6;font-size:12px}.running{color:#146c42;background:#e8f5ec}.suspended{color:#994510;background:#fff1df}button,.btn{border:1px solid #c7d3e3;background:white;color:#244d91;border-radius:6px;padding:9px 13px;font:inherit;font-weight:600;cursor:pointer;text-decoration:none}button.primary{background:#2259be;color:white;border-color:#2259be}button.warn{color:#a34118}button:disabled{opacity:.5;cursor:not-allowed}label,.label{display:block;font-weight:600;font-size:12px;color:#44536a}input,select{width:100%;display:block;margin-top:6px;border:1px solid #cbd5e1;border-radius:6px;padding:9px;background:#fff;color:#182438;font:14px system-ui}.formgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(205px,1fr));gap:13px;margin:15px 0}.wide{grid-column:1/-1}.checks{display:flex;flex-wrap:wrap;gap:12px;margin-top:9px}.check{display:flex;align-items:center;gap:6px;font-weight:400}.check input{width:auto;margin:0}.inline{display:inline}.actions{display:flex;flex-wrap:wrap;gap:6px}.actions form{display:inline}details{margin-top:12px}summary{cursor:pointer;color:#2459c4;font-weight:600}.login{max-width:420px;margin:10vh auto;padding:24px}.login input{margin-bottom:14px}.usage{font-size:12px;line-height:1.6}.fine{font-size:12px;color:#64748b}footer{padding:20px 4%;color:#64748b;font-size:12px}@media(max-width:600px){main{padding:20px 12px}header{padding:14px 12px}.panel{padding:12px}}
"""


def page(title,body):
    return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>'+esc(title)+' | MinuteSeal</title><style>'+CSS+'</style>'+body+'</html>'


def setup_required_page(available=False,message=""):
    body='<main class="login panel"><h1>MinuteSeal</h1><p class="muted">Platform administrator setup required.</p>'
    if message:body+='<p class="notice" role="alert">'+esc(message)+'</p>'
    if available:
        body+='<p>Use your privately issued, one-time enrollment key. Choose a unique password and then enroll your authenticator.</p><form method="post" action="/setup"><label>Private enrollment key<input name="key" type="password" autocomplete="off" maxlength="128" required></label><label>New platform password<input name="password" type="password" autocomplete="new-password" minlength="16" maxlength="256" required></label><label>Confirm password<input name="confirm" type="password" autocomplete="new-password" minlength="16" maxlength="256" required></label><button class="primary">Continue to authenticator</button></form>'
    else:
        body+='<p>First-time access is locked. An authorized operator must enable a private enrollment key or complete setup at a trusted terminal.</p>'
    return page("First-time setup",body+'<p class="fine">This is not customer registration. No default password or public administrator signup is available.</p></main>')


def enrollment_code_page(challenge,message=""):
    return page("Confirm authenticator",'<main class="login panel"><h1>Set up MFA</h1>'+('<p role="alert" class="notice">'+esc(message)+'</p>' if message else '')+'<p>In your authenticator app, add a time-based account named MinuteSeal Platform. Enter the following setup key (6 digits, 30 seconds).</p><p style="font:600 15px monospace;overflow-wrap:anywhere;background:#eef3fa;padding:12px">'+esc(challenge["secret"])+'</p><form method="post" action="/setup/confirm">'+hidden("csrf",challenge["csrf"])+'<label>Current authenticator code<input name="otp" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label><button class="primary">Finish setup</button></form><p class="fine">This step expires in five minutes. Keep your authenticator key private and save a secure recovery copy offline.</p></main>')


def login_page(message=""):
    return page("Platform sign in",'<main class="login panel"><h1>MinuteSeal</h1><p class="muted">Private platform administration</p>'+('<p class="notice">'+esc(message)+'</p>' if message else '')+'<form action="/login" method="post"><label>Platform password<input type="password" name="password" autocomplete="current-password" required maxlength="256"></label><label>Authenticator code<input name="otp" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label><button class="primary">Sign in</button></form><p class="fine">Operator access only. Customer workspace credentials are not accepted.</p></main>')


def billing_panel(rows,csrf,gateways=None):
    gateways=gateways or {}
    out='<section class="panel"><h2>Payment gateway settings</h2><p class="muted">Production · Uganda mobile money. Credentials are write-only. Leave existing credential fields blank to keep their values. Enable only after verifying the merchant account.</p>'
    for provider,keys in pg.PROVIDERS.items():
        state=gateways.get(provider,{})
        out+='<div class="notice"><h3>'+esc(pg.LABELS[provider])+'</h3><p>'+("Configured" if state.get("configured") else "Not configured")+' · '+("Enabled" if state.get("enabled") else "Disabled")+(" · Default" if state.get("default") else "")+'</p>'+form_start(csrf,"configure_gateway")+hidden("provider",provider)+'<div class="formgrid">'
        labels={"username":"API username","password":"API password","client_id":"Client ID","client_secret":"Client secret","wallet_id":"Wallet ID"}
        for key in keys:
            out+='<label>'+esc(labels[key])+'<input type="password" name="'+esc(key)+'" autocomplete="new-password" maxlength="512" placeholder="'+("Leave blank to retain" if state.get("configured") else "Enter credential")+'" '+("" if state.get("configured") else "required")+'></label>'
        out+='</div><label class="check"><input type="checkbox" name="enabled" value="yes" '+("checked" if state.get("enabled") else "")+'> Enable collections</label><label class="check"><input type="checkbox" name="default" value="yes" '+("checked" if state.get("default") else "")+'> Make default gateway</label><button class="primary">Save gateway</button></form>'
        if state.get("configured"):
            out+=form_start(csrf,"test_gateway")+hidden("provider",provider)+'<button>Test connection (no payment)</button></form>'
        out+='</div>'
    out+='</section><section class="panel"><h2>Invoices &amp; payments</h2><p class="muted">Create a subscription invoice, reconcile a confirmed collection, and apply the renewal. A payment request requires the payer’s explicit consent. Do not retry an uncertain request.</p>'
    for slug,row in sorted(rows.items()):
        out+='<div class="notice"><h3>'+esc(profile(row)["name"])+'</h3>'+form_start(csrf,"create_invoice",slug)+'<div class="formgrid">'+field("Invoice amount","amount","","number")+dropdown("Currency","currency",[(k,k) for k in billing.CURRENCIES],"UGX")+field("Subscription months","months","1","number")+'</div><button class="primary">Create invoice</button></form>'
        for inv in reversed(list(row.get("invoices",{}).values())):
            iid=inv["id"]; status=inv["status"]
            out+='<div class="notice"><strong>'+esc(iid)+'</strong> · '+esc(billing.display(inv["amount_minor"],inv["currency"]))+' · '+esc(inv["months"])+' months · '+esc(status.replace("_"," "))+'<p><a href="/billing/document?slug='+esc(slug)+'&amp;id='+esc(iid)+'">Print invoice</a>'
            if status=="paid":out+=' · <a href="/billing/document?slug='+esc(slug)+'&amp;id='+esc(iid)+'&amp;receipt=yes">Print receipt</a>'
            out+='</p>'
            if inv.get("customer_checkout"):
                out+='<p>Customer checkout issued · link valid for seven days.</p>'
                if status=="open":
                    out+=form_start(csrf,"revoke_checkout",slug)+hidden("invoice",iid)+'<button>Revoke checkout link</button></form>'
            elif status=="open" and not inv.get("sandbox") and inv["currency"]=="UGX" and os.environ.get("CC_CHECKOUT_INBOX") and os.environ.get("CC_CHECKOUT_ORIGIN"):
                out+=form_start(csrf,"issue_checkout",slug)+hidden("invoice",iid)+'<button class="primary">Create customer checkout link</button></form>'
            if status=="open" and not inv.get("sandbox") and not inv.get("customer_checkout"):
                providers=[(k,pg.LABELS[k]) for k,v in gateways.items() if k in pg.PROVIDERS and v.get("enabled")]
                default=next((k for k,v in gateways.items() if v.get("default") and v.get("enabled")),"")
                if providers and inv["currency"]=="UGX":
                    out+=form_start(csrf,"start_collection",slug)+hidden("invoice",iid)+dropdown("Gateway","provider",providers,default)+field("Consenting payer mobile number","phone")+'<label class="check"><input type="checkbox" name="confirm" value="yes" required> Payer explicitly authorized this exact invoice amount and request</label><button>Request mobile money payment</button></form>'
                out+=form_start(csrf,"manual_settlement",slug)+hidden("invoice",iid)+'<div class="formgrid">'+dropdown("Payment method","method",[(k,k.replace("_"," ").title()) for k in sorted(billing.METHODS)],"bank")+field("Verified transaction reference","reference")+field("Confirmed amount","amount","","number")+'</div><label class="check"><input type="checkbox" name="confirm" value="yes" required> I independently verified receipt of this payment</label><button>Record verified settlement</button></form>'
                out+=form_start(csrf,"cancel_invoice",slug)+hidden("invoice",iid)+'<label class="check"><input type="checkbox" name="confirm" value="yes" required> Confirm cancellation</label><button class="warn">Cancel invoice</button></form>'
            if status in {"collection_pending","collection_unknown","paid_pending_sync"}:
                out+=form_start(csrf,"verify_payment",slug)+hidden("invoice",iid)+'<button>Verify payment / sync renewal</button></form>'
            out+='</div>'
        out+='</div>'
    return out+'</section>'


def billing_document(row,inv,receipt=False):
    if receipt and inv["status"]!="paid":raise ValueError("Receipt requires a settled invoice")
    title="PAYMENT RECEIPT" if receipt else "SUBSCRIPTION INVOICE"
    body='<main><section class="panel"><h1>MinuteSeal</h1><h2>'+title+'</h2><p>'+esc(inv["receipt_id"] if receipt else inv["id"])+'</p><p>Organization: '+esc(inv["customer"])+'<br>Workspace: '+esc(inv["tenant"])+'<br>Invoice: '+esc(inv["id"])+'<br>Issued: '+esc(inv["created_at"])+'</p><table><thead><tr><th>Description</th><th>Duration</th><th>Total</th></tr></thead><tbody><tr><td>'+esc(inv["plan"].title())+' subscription</td><td>'+esc(inv["months"])+' months</td><td>'+esc(billing.display(inv["amount_minor"],inv["currency"]))+'</td></tr></tbody></table><p>Status: '+esc(inv["status"].replace("_"," "))+'</p>'
    if inv.get("sandbox"):body+='<h2>TEST ONLY — NOT A REAL PAYMENT</h2>'
    if receipt:
        payment=inv["payment"]; renewal=inv.get("renewal",{})
        body+='<p>Payment method: '+esc(payment["channel"])+'<br>Payment reference: '+esc(payment["reference"])+'<br>Recorded: '+esc(payment["recorded_at"])+'</p>'
        if isinstance(renewal,dict):body+='<p>Subscription expiry: '+esc(renewal["new_expiry"])+'</p>'
    return page(title,body+'<p class="fine">Print or save as PDF using your browser. This document is not a statutory tax invoice.</p></section></main>')


def billing_action(root,rows,form):
    action=one(form,"action")
    if action=="configure_gateway":
        provider=one(form,"provider")
        pg.configure(root,provider,{k:one(form,k) for k in pg.PROVIDERS.get(provider,())},one(form,"enabled")=="yes",one(form,"default")=="yes")
        audit(root,action,provider,"success")
        return "Gateway configuration saved."
    if action=="test_gateway":
        provider=one(form,"provider")
        g,_=pg.gateway(root,provider);g.test()
        audit(root,action,provider,"success")
        return "Gateway connection test succeeded; no payment was requested."
    slug=one(form,"slug");row=rows.get(slug)
    if not row:raise ValueError("Unknown organization")
    if action=="create_invoice":
        billing.create_invoice(row,one(form,"amount"),one(form,"currency"),int(one(form,"months")))
        message="Invoice created."
    else:
        inv=billing.invoice(row,one(form,"invoice"))
        if action in {"issue_checkout","revoke_checkout"}:
            path=Path(os.environ["CC_CHECKOUT_INBOX"])
            origin=os.environ["CC_CHECKOUT_ORIGIN"]
            u=urlsplit(origin)
            if u.scheme!="https" or not u.hostname or u.username or u.password or u.path or u.query or u.fragment:raise ValueError("Invalid checkout origin")
            if action=="issue_checkout":
                providers=[k for k,v in pg.public_config(root).items() if v["enabled"] and (k!="iotec" or 500<=inv["amount_minor"]<=1000000000)]
                token=checkout.issue(path,inv,providers)
                billing.persist(root,rows)
                checkout.publish(path,inv)
                message="Copy and privately share this checkout link (shown once): "+origin+"/checkout/"+token
            else:
                checkout.revoke(path,inv)
                billing.persist(root,rows)
                message="Checkout revoked."
        elif action=="start_collection":
            if inv.get("customer_checkout"):raise ValueError("Revoke customer checkout first")
            billing.begin_collection(root,rows,row,inv,one(form,"provider"),one(form,"phone"),one(form,"confirm")=="yes")
            message="Collection submitted; verify the final status before retrying anything."
        elif action=="verify_payment":
            billing.reconcile(root,rows,row,inv)
            message="Invoice status: "+inv["status"].replace("_"," ")
        elif action=="manual_settlement":
            if inv.get("customer_checkout"):raise ValueError("Revoke customer checkout first")
            billing.record_manual(root,rows,row,inv,one(form,"method"),one(form,"reference"),one(form,"amount"),inv["currency"],one(form,"confirm")=="yes")
            message="Verified external settlement recorded and renewal applied."
        elif action=="cancel_invoice" and one(form,"confirm")=="yes":
            if inv.get("customer_checkout"):raise ValueError("Revoke customer checkout first")
            billing.cancel(inv);message="Invoice cancelled."
        else:raise ValueError("Unknown billing operation")
    audit(root,action,slug,"success")
    return message


def dashboard(rows,events,csrf,query="",filter_state="",message="",applications=(),gateways=None,trial_days=30,trial_capacity=2):
    profiles=[profile(r) for r in rows.values()]
    snapshots=[p["usage"] for p in profiles if p["usage"]]
    active=sum(bool(r.get("enabled")) for r in rows.values())
    totals=[("Organizations",len(rows)),("Enabled",active),("Not enabled",len(rows)-active),
            ("Active users (snapshots)",sum(s["active_users"] for s in snapshots) if snapshots else "—"),
            ("Storage GiB (snapshots)",round(sum(s["storage_bytes"] for s in snapshots)/2**30,2) if snapshots else "—")]
    body='<header><div><strong>MinuteSeal</strong> <small>Platform administration</small></div>'+form_start(csrf,"logout")+'<button>Sign out</button></form></header><main><h1>Organization management</h1><p class="muted">Manage isolated customer workspaces, subscription configurations and operational usage.</p>'
    if message:body+='<p role="status" class="notice">'+esc(message)+'</p>'
    body+='<div class="stats">'+''.join(f'<div class="stat"><span class="muted">{esc(k)}</span><b>{esc(v)}</b></div>' for k,v in totals)+'</div>'
    body+='<div class="notice">Usage is refreshed on demand; '+str(len(snapshots))+' of '+str(len(rows))+' workspaces have snapshots. Subscription limits and feature switches apply to upgraded managed workspaces. AI allowance is distinct from provider billing.</div>'
    body+='<section class="panel"><h2>Trial policy</h2><p class="muted">Applies to newly activated trials. Existing subscription dates are unchanged.</p>'+form_start(csrf,"configure_trial")+field("Default trial duration (days)","trial_days",trial_days,"number")+field("Maximum automatic running workspaces (0 disables)","trial_capacity",trial_capacity,"number")+'<button class="primary">Save trial duration</button></form></section>'
    body+='<section class="panel"><h2>Registration inbox</h2><p class="muted">Review email-verified applications before creating a workspace.</p>'
    for app in applications:
        body+='<div class="notice"><strong>'+esc(app["name"])+'</strong> · '+esc(app["sector"])+' · '+esc(app["plan"])+'<p>'+esc(app["contact"])+' · '+esc(app["email"])+' · '+esc(app["slug"])+' · '+esc(app["status"])+'</p>'
        if app["status"]=="verified":
            body+=form_start(csrf,"approve_registration")+hidden("ref",app["ref"])+'<div class="formgrid">'+field("Approved HTTPS hostname","host")+field("Unused loopback port","port","","number")+'</div><button class="primary">Approve and provision</button></form>'+form_start(csrf,"reject_registration")+hidden("ref",app["ref"])+'<label class="check"><input type="checkbox" name="confirm" value="yes" required> Confirm decline</label><button class="warn">Decline</button></form>'
        body+='</div>'
    if not applications:body+='<p class="muted">No verified applications available.</p>'
    body+='</section>'
    body+='<section class="panel"><h2>Organizations</h2><form method="get" class="toolbar"><label>Search<input name="q" value="'+esc(query)+'" placeholder="Name, type or domain"></label>'+dropdown("Lifecycle","state",[("","All"),("enabled","Enabled"),("disabled","Not enabled")],filter_state)+'<button>Filter</button><a href="/">Reset</a></form><div class="scroll"><table><thead><tr><th>Organization</th><th>Lifecycle</th><th>Subscription</th><th>Usage snapshot</th><th>Operations</th></tr></thead><tbody>'
    for slug,row in sorted(rows.items()):
        p=profile(row)
        if query.casefold() not in " ".join((p["name"],slug,row["host"],p["sector"])).casefold():continue
        if filter_state and (filter_state=="enabled")!=bool(row.get("enabled")):continue
        status=p["lifecycle"]
        if status not in {"unknown — reconcile","suspended"}:status="running" if row.get("enabled") else "not started"
        u=p["usage"]
        limits=p["limits"]
        expiry=p["expiry"] or "Not set"
        expired=bool(p["expiry"] and date.fromisoformat(p["expiry"])<date.today())
        usage='Not collected'
        if u:
            usage=f'{u["active_users"]} / {limits["users"]} users<br>{u["storage_bytes"]/2**30:.2f} / {limits["storage_gib"]} GiB<br>{u["meetings"]} meetings · {u["jobs_this_month"]} jobs/month<br>{u.get("ai_seconds",0)/60:.1f} / {limits["ai_minutes"]} AI allowance min<br><small>{esc(u["collected_at"])}</small>'
        buttons=""
        for action,label in (("activate","Start"),("suspend","Suspend"),("refresh","Refresh usage")):
            if action=="activate" and row.get("enabled"):continue
            if action in {"suspend","refresh"} and not row.get("enabled"):continue
            if action=="suspend":
                # An explicit confirmation checkbox prevents accidental stop.
                buttons+=form_start(csrf,action,slug)+'<label class="check"><input type="checkbox" name="confirm" value="yes" required> Confirm stop</label><button class="warn">Suspend</button></form>'
            else:buttons+=form_start(csrf,action,slug)+f'<button>{esc(label)}</button></form>'
        if row.get("registration_ref") and row.get("enabled"):
            buttons+=form_start(csrf,"send_setup",slug)+'<label class="check"><input type="checkbox" name="confirm" value="yes" required> DNS/TLS route verified</label><button>Send setup invitation</button></form>'
        body+=f'<tr><td><strong>{esc(p["name"])}</strong><small>{esc(p["sector"])} · {esc(slug)}</small><a href="https://{esc(row["host"])}" rel="noreferrer">{esc(row["host"])}</a></td><td><span class="pill {esc(status)}">{esc(status)}</span></td><td>{esc(p["plan"].title())}<small>Expiry: {esc(expiry)}{" · Expired" if expired else ""}</small></td><td class="usage">{usage}</td><td><div class="actions">{buttons}</div><details><summary>Configure workspace</summary>'+form_start(csrf,"configure",slug)+'<div class="formgrid">'+settings_fields(p)+'</div><button class="primary">Save configuration</button> <button name="apply_preset" value="yes">Save with plan defaults</button></form></details></td></tr>'
    body+='</tbody></table></div></section><section class="panel"><h2>Provision an organization</h2><p class="muted">Creates an isolated workspace definition and credentials. Starting the stack and configuring public DNS/TLS are separate operations.</p>'+form_start(csrf,"provision")+'<div class="formgrid">'+field("Workspace identifier","slug")+field("HTTPS hostname","host")+field("Administrator email","email","","email")+field("Unused loopback port","port","","number")+settings_fields({"name":"","sector":"Other","plan":"starter","expiry":"","features":list(FEATURES),"limits":PLANS["starter"]})+'</div><button class="primary">Create organization</button></form></section>'
    body+=billing_panel(rows,csrf,gateways)
    body+='<section class="panel"><h2>Plan reference</h2><p class="muted">Illustrative default allowances; configure actual limits on each organization.</p><div class="scroll"><table><thead><tr><th>Plan</th><th>Users</th><th>Storage GiB</th><th>AI minutes/month</th></tr></thead><tbody>'+''.join(f'<tr><td>{esc(k.title())}</td><td>{v["users"]}</td><td>{v["storage_gib"]}</td><td>{v["ai_minutes"]}</td></tr>' for k,v in PLANS.items())+'</tbody></table></div></section>'
    body+='<section class="panel"><h2>Platform activity</h2><div class="scroll"><table><thead><tr><th>Time UTC</th><th>Operation</th><th>Workspace</th><th>Result</th></tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+esc(e.get(k,""))+'</td>' for k in ("timestamp","action","organization","outcome"))+'</tr>' for e in events)+'</tbody></table></div></section></main><footer>MinuteSeal · Private operator console · No customer meeting content is displayed.</footer>'
    return page("Organizations",body)


class Console(HTTPServer):
    def __init__(self,root,port,origin=None):
        if origin:
            u=urlsplit(origin)
            if u.scheme!="https" or not u.hostname or u.netloc!=u.hostname or not re.fullmatch(r"[a-z0-9.-]+",u.hostname) or u.path or u.query or u.fragment:
                raise ValueError("Provide a dedicated HTTPS origin without a trailing slash.")
        self.root=root
        self.sessions={}
        self.attempts=[]
        self.setup_attempts=[]
        self.enrollment=None
        self.secure=bool(origin)
        self.cookie_name="__Host-minuteseal-platform" if self.secure else COOKIE
        super().__init__(("127.0.0.1",port),Handler)
        self.origin=origin or f"http://127.0.0.1:{self.server_port}"


class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(15)

    def log_message(self,*args):
        # Never write URL query strings, headers or credentials to logs.
        pass

    def send_html(self,body,status=200,cookie=None):
        raw=body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type","text/html; charset=utf-8")
        self.send_header("Content-Length",str(len(raw)))
        self.send_header("Cache-Control","no-store")
        self.send_header("X-Content-Type-Options","nosniff")
        self.send_header("X-Frame-Options","DENY")
        self.send_header("Referrer-Policy","no-referrer")
        self.send_header("Content-Security-Policy","default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'")
        if cookie:self.send_header("Set-Cookie",cookie)
        self.end_headers()
        self.wfile.write(raw)

    def valid_host(self):
        return self.headers.get("Host")==urlsplit(self.server.origin).netloc

    def session_cookie(self,token,clear=False):
        return f"{self.server.cookie_name}={token}; Path=/; HttpOnly; SameSite=Strict"+("; Secure" if self.server.secure else "")+("; Max-Age=0" if clear else "")

    def session(self):
        try:
            cookie=SimpleCookie(self.headers.get("Cookie",""))
            token=cookie[self.server.cookie_name].value
        except (KeyError,ValueError):
            return None,None
        s=self.server.sessions.get(token)
        if not s or min(s["expires"],s["absolute"])<=time.monotonic():
            self.server.sessions.pop(token,None)
            return None,None
        s["expires"]=time.monotonic()+SESSION_SECONDS
        return token,s

    def show_dashboard(self,session,message="",query="",state=""):
        with tenantctl.registry(self.server.root) as rows:
            path=operator_onboarding.inbox_path()
            try:
                applications=onboarding.inbox(path) if path else []
            except Exception:
                applications=[]
                message=(message+" Registration inbox unavailable.").strip()
            body=dashboard(rows,audit_tail(self.server.root),session["csrf"],query,state,message,applications,pg.public_config(self.server.root),trial_policy.days(self.server.root),trial_policy.capacity(self.server.root))
        self.send_html(body)

    def do_GET(self):
        if not self.valid_host():
            return self.send_html(page("Denied","Invalid host"),421)
        u=urlsplit(self.path)
        _,session=self.session()
        if not session:
            if platform_mfa.enrolled(self.server.root):return self.send_html(login_page())
            return self.send_html(setup_required_page(self.server.secure and web_enroll.available(self.server.root)))
        q=parse_qs(u.query)
        if u.path=="/billing/document":
            try:
                with tenantctl.registry(self.server.root) as rows:
                    row=rows[one(q,"slug")];inv=billing.invoice(row,one(q,"id"));document=billing_document(row,inv,one(q,"receipt")=="yes")
                return self.send_html(document)
            except (KeyError,ValueError):return self.send_html(page("Not found","Document unavailable"),404)
        if u.path!="/":return self.send_html(page("Not found","Not found"),404)
        self.show_dashboard(session,message=session.pop("flash",""),query=one(q,"q")[:150],state=one(q,"state"))

    def enrollment_post(self,path,form):
        root=self.server.root
        if not self.server.secure or platform_mfa.enrolled(root) or not web_enroll.available(root):
            return self.send_html(setup_required_page(),403)
        clock=time.monotonic()
        self.server.setup_attempts=[t for t in self.server.setup_attempts if clock-t<60]
        if len(self.server.setup_attempts)>=5:
            return self.send_html(setup_required_page(True,"Too many attempts. Retry in one minute."),429)
        self.server.setup_attempts.append(clock)
        if path=="/setup":
            try:
                if one(form,"password")!=one(form,"confirm"):
                    raise ValueError("Passwords do not match.")
                challenge=web_enroll.begin(root,one(form,"key"),one(form,"password"),password_record)
            except ValueError:
                return self.send_html(setup_required_page(True,"Invalid enrollment key or password. Use at least 16 characters."),400)
            self.server.enrollment=challenge
            return self.send_html(enrollment_code_page(challenge),cookie=web_enroll.cookie(challenge["nonce"]))
        challenge=self.server.enrollment
        try:
            cookie=SimpleCookie(self.headers.get("Cookie",""))
            nonce=cookie[web_enroll.COOKIE].value
        except (KeyError,ValueError):
            nonce=""
        if not challenge or not web_enroll.valid_challenge(challenge,nonce,one(form,"csrf")):
            self.server.enrollment=None
            return self.send_html(setup_required_page(True,"Enrollment expired. Start again."),403,cookie=web_enroll.cookie("",clear=True))
        challenge["attempts"]+=1
        step=platform_mfa.match(challenge["secret"],one(form,"otp"))
        if step is None:
            if challenge["attempts"]>=5:
                self.server.enrollment=None
                return self.send_html(setup_required_page(True,"Start again with your private enrollment key."),429,cookie=web_enroll.cookie("",clear=True))
            return self.send_html(enrollment_code_page(challenge,"Incorrect authenticator code."),401)
        try:
            web_enroll.finish(root,challenge,step)
        except ValueError:
            self.server.enrollment=None
            return self.send_html(setup_required_page(web_enroll.available(root),"Enrollment unavailable. Start again."),403,cookie=web_enroll.cookie("",clear=True))
        self.server.enrollment=None
        self.server.setup_attempts.clear()
        audit(root,"enroll","platform","success")
        return self.send_html(login_page("Administrator created. Sign in with a fresh authenticator code."),cookie=web_enroll.cookie("",clear=True))

    def do_POST(self):
        if not self.valid_host() or self.headers.get("Origin")!=self.server.origin:
            return self.send_html(page("Denied","Invalid request origin"),403)
        if self.headers.get("Content-Type","").split(";")[0]!="application/x-www-form-urlencoded":
            return self.send_html(page("Invalid request","Unsupported form encoding"),415)
        try:
            length=int(self.headers.get("Content-Length","0"))
            if not 0<length<=MAX_BODY:raise ValueError()
            form=parse_qs(self.rfile.read(length).decode("utf-8"),keep_blank_values=True,max_num_fields=50)
        except (ValueError,UnicodeError):
            return self.send_html(page("Invalid request","Invalid form"),400)
        path=urlsplit(self.path).path
        if path in ("/setup","/setup/confirm"):
            return self.enrollment_post(path,form)
        if path=="/login":
            clock=time.monotonic()
            self.server.attempts=[t for t in self.server.attempts if clock-t<60]
            if len(self.server.attempts)>=5:
                return self.send_html(login_page("Too many attempts. Retry after one minute."),429)
            self.server.attempts.append(clock)
            if not platform_mfa.enrolled(self.server.root):
                return self.send_html(setup_required_page(self.server.secure and web_enroll.available(self.server.root)),503)
            if not platform_mfa.verify(self.server.root,one(form,"password"),one(form,"otp"),check_password):
                audit(self.server.root,"login","platform","rejected")
                return self.send_html(login_page("Incorrect password or authenticator code."),401)
            audit(self.server.root,"login","platform","success")
            self.server.attempts.clear()
            self.server.sessions={k:v for k,v in self.server.sessions.items() if min(v["expires"],v["absolute"])>clock}
            token=secrets.token_urlsafe(32)
            s={"csrf":secrets.token_urlsafe(32),"expires":clock+SESSION_SECONDS,"absolute":clock+8*3600}
            self.server.sessions[token]=s
            self.send_response(303)
            self.send_header("Location","/")
            self.send_header("Cache-Control","no-store")
            self.send_header("Set-Cookie",self.session_cookie(token))
            self.end_headers()
            return
        token,s=self.session()
        if path!="/action" or not s or not hmac.compare_digest(one(form,"csrf").encode("utf-8"),s["csrf"].encode("utf-8")):
            return self.send_html(page("Denied","Authentication and a valid CSRF token are required"),403)
        action=one(form,"action")
        if action=="logout":
            self.server.sessions.pop(token,None)
            audit(self.server.root,"logout","platform","success")
            return self.send_html(login_page(),cookie=self.session_cookie("",clear=True))
        if action=="suspend" and one(form,"confirm")!="yes":
            return self.show_dashboard(s,"Confirm suspension before stopping a workspace.")
        try:
            with tenantctl.registry(self.server.root) as rows:
                if action=="configure_trial":
                    trial_policy.configure(self.server.root,int(one(form,"trial_days")),int(one(form,"trial_capacity")))
                    audit(self.server.root,action,"platform","success")
                    message="Default trial duration saved."
                elif action in {"configure_gateway","test_gateway","create_invoice","start_collection","verify_payment","manual_settlement","cancel_invoice","issue_checkout","revoke_checkout"}:
                    message=billing_action(self.server.root,rows,form)
                elif action in {"approve_registration","reject_registration","send_setup"}:
                    path=operator_onboarding.inbox_path()
                    if not path:raise ValueError("Registration inbox not configured.")
                    if action=="approve_registration":
                        row=operator_onboarding.approve(path,self.server.root,rows,one(form,"ref"),one(form,"host").strip().lower(),int(one(form,"port")),defaults,PLANS,FEATURES)
                        audit(self.server.root,action,row["slug"],"success")
                        message="Verified application approved and provisioned. Start the workspace and configure DNS/TLS before sending setup."
                    elif action=="reject_registration":
                        if one(form,"confirm")!="yes":raise ValueError("Confirm decline.")
                        app=onboarding.application(path,one(form,"ref"))
                        onboarding.transition(path,app["ref"],"verified","rejected")
                        audit(self.server.root,action,app["slug"],"success")
                        message="Application declined."
                    else:
                        if one(form,"confirm")!="yes":raise ValueError("Confirm public routing.")
                        row=rows.get(one(form,"slug"))
                        if not row:raise ValueError("Unknown workspace.")
                        completed=operator_onboarding.send_setup(path,self.server.root,row,safe_compose)
                        audit(self.server.root,action,row["slug"],"success")
                        message="Registered administrator activated with the configured trial." if completed else "Single-use setup invitation sent to the verified administrator."
                else:
                    message=dispatch(self.server.root,rows,form)
        except Exception:
            message="Invalid or unavailable organization configuration. Check the inputs and existing registry."
        s["flash"]=message
        self.send_response(303)
        self.send_header("Location","/")
        self.send_header("Cache-Control","no-store")
        self.end_headers()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root",type=Path,default=tenantctl.DEFAULT_ROOT)
    parser.add_argument("--port",type=int,default=18790)
    parser.add_argument("--origin",default=None,help="Dedicated HTTPS reverse proxy origin.")
    parser.add_argument("--init-password",action="store_true")
    args=parser.parse_args()
    root=args.root.resolve()
    if args.init_password:
        platform_mfa.enroll_interactive(root,password_record)
        audit(root,"enroll","platform","success")
        return
    with tenantctl.registry(root):
        platform_mfa.enrolled(root)
    server=Console(root,args.port,args.origin)
    print(f"MinuteSeal console bound to loopback; allowed origin {server.origin}.")
    server.serve_forever()


if __name__=="__main__":
    main()
