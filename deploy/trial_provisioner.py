"""Bounded operator worker. The public registration service cannot invoke Docker.
Only validated, OTP-verified registrations carrying a password hash are eligible.
All hostnames are generated under the dedicated workspace suffix.
"""
import argparse
import ipaddress
import json
import os
import re
import shutil
import socket
import subprocess
import time
from datetime import datetime,timezone,timedelta
from pathlib import Path
import onboarding
import operator_onboarding
import tenantctl
import trial_policy
import platform_admin as admin
import entitlements

SUFFIX=".minuteseal.arosoftlabs.com"
ORIGIN_IP="95.111.234.34"
NGINX=Path("/www/server/nginx/sbin/nginx")
CONF=Path("/www/server/panel/vhost/nginx")
WEBROOT=Path("/var/www/minuteseal-acme")
CERTROOT=Path("/etc/letsencrypt/live")
FIRST_PORT=19100
LAST_PORT=19200

def eligible(app):
    try:
        clean=onboarding.validate(app)
        return app["status"] in ("verified","provisioned") and onboarding.REF.fullmatch(app["ref"]) and clean["slug"]==app["slug"] and clean["plan"]=="starter"
    except (ValueError,KeyError,TypeError):
        return False

def available_port(rows):
    reserved={r["port"] for r in rows.values()}
    for port in range(FIRST_PORT,LAST_PORT):
        if port in reserved:continue
        try:
            with socket.socket() as sock:sock.bind(("127.0.0.1",port))
            return port
        except OSError:continue
    raise ValueError("No automatic workspace ports available")

def resources_ok():
    values={}
    for line in Path("/proc/meminfo").read_text().splitlines():
        if line.startswith("MemAvailable:"):values["available"]=int(line.split()[1])*1024
    return values.get("available",0)>=3*2**30 and shutil.disk_usage("/").free>=15*2**30

def dns_ready(host):
    try:
        resolved={str(ipaddress.ip_address(v[4][0])) for v in socket.getaddrinfo(host,443,socket.AF_INET,socket.SOCK_STREAM)}
        return resolved=={ORIGIN_IP}
    except (OSError,ValueError):
        return False

def run(args,timeout=60):
    result=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,timeout=timeout,check=False)
    if result.returncode:raise RuntimeError("Provisioning operation failed.")
    return result.stdout

def persist(root,rows):
    tenantctl.private_write(root/"registry.json",json.dumps(rows,indent=2)+"\n")

def route_config(row):
    host=row["host"];port=row["port"]
    tenantctl.validate(row["slug"],host,row["admin_email"],port)
    if host!=row["slug"]+SUFFIX:raise ValueError("Invalid generated workspace hostname")
    return f"""# MinuteSeal automatic trial route. Managed by trial_provisioner.
server {{
    listen 80;
    server_name {host};
    location ^~ /.well-known/acme-challenge/ {{
        root {WEBROOT};
        try_files $uri =404;
    }}
    location / {{ return 308 https://{host}$request_uri; }}
}}
server {{
    listen 443 ssl;
    server_name {host};
    ssl_certificate {CERTROOT}/{host}/fullchain.pem;
    ssl_certificate_key {CERTROOT}/{host}/privkey.pem;
    if ($host != {host}) {{ return 421; }}
    client_max_body_size 100m;
    location / {{
        proxy_pass http://127.0.0.1:{port};
        proxy_http_version 1.1;
        proxy_set_header Host {host};
        proxy_set_header X-Forwarded-Host {host};
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_read_timeout 180s;
        proxy_send_timeout 180s;
    }}
}}
"""

def configure_route(row):
    host=row["host"]
    if not dns_ready(host):raise RuntimeError("Workspace DNS is not ready")
    if not (CERTROOT/host/"fullchain.pem").is_file():
        run(["/usr/bin/certbot","certonly","--non-interactive","--agree-tos","--webroot","-w",str(WEBROOT),"--cert-name",host,"-d",host,"--keep-until-expiring"],timeout=150)
    path=CONF/(host+".conf")
    desired=route_config(row)
    if path.exists():
        if path.is_symlink() or path.read_text()!=desired:raise RuntimeError("Workspace route conflicts with existing configuration")
    else:
        # Atomic replacement with rollback, no edits to other virtual hosts.
        tenantctl.private_write(path,desired)
        try:
            run([str(NGINX),"-t"])
            run([str(NGINX),"-s","reload"])
        except Exception:
            path.unlink(missing_ok=True)
            run([str(NGINX),"-t"])
            run([str(NGINX),"-s","reload"])
            raise
    result=json.loads(run(["/usr/bin/curl","--noproxy","*","-fsS","--max-time","12","--resolve",host+":443:127.0.0.1","https://"+host+"/api/health"],timeout=20))
    if result.get("status")!="healthy" or result.get("database")!="healthy" or result.get("redis")!="healthy":
        raise RuntimeError("Workspace health check failed")

def start_stack(root,row):
    tenantctl.validate(row["slug"],row["host"],row["admin_email"],row["port"])
    args=tenantctl.compose_command(root,row)
    args+=["-f",str(tenantctl.REPO/"deploy/compose.trial.yml"),"up","-d","--no-build","--pull","never","--wait","--wait-timeout","100"]
    # No inherited tenant credentials can override the private tenant env.
    env={k:os.environ[k] for k in ("PATH","HOME","LANG","LC_ALL","DOCKER_HOST","DOCKER_CONTEXT","DOCKER_CONFIG","XDG_RUNTIME_DIR") if k in os.environ}
    result=subprocess.run(args,cwd=tenantctl.REPO,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=150,check=False)
    if result.returncode:raise RuntimeError("Workspace stack could not start")
    row["enabled"]=True
    row["profile"]["lifecycle"]="running"

def activate_one(root,path,rows):
    limit=trial_policy.capacity(root)
    if limit==0 or not resources_ok():return False
    active=sum(bool(r.get("automatic_trial")) and (r.get("enabled") or r.get("profile",{}).get("lifecycle")!="suspended") for r in rows.values())
    now=int(time.time())
    for app in reversed(onboarding.inbox(path)):
        if not eligible(app) or not onboarding.pending_password(path,app["ref"]):continue
        slug=app["slug"];host=slug+SUFFIX
        if not dns_ready(host):continue
        row=rows.get(slug)
        if row:
            if not row.get("automatic_trial") or row.get("registration_ref")!=app["ref"] or row["host"]!=host or row["admin_email"]!=app["email"]:continue
            if row.get("profile",{}).get("lifecycle")=="suspended" or now-row.get("activation_attempted_at",0)<300 or row.get("activation_attempts",0)>=3:continue
        else:
            if active>=limit or app["status"]!="verified":continue
            # Existing manually configured customer records are not reused.
            row=operator_onboarding.approve(path,root,rows,app["ref"],host,available_port(rows),admin.defaults,admin.PLANS,admin.FEATURES)
            row["automatic_trial"]=True
            # Until actual activation, trial policy remains expired/fail-closed.
            row["profile"]["expiry"]=(datetime.now(timezone.utc).date()-timedelta(days=1)).isoformat()
            row["profile"]["grace_days"]=0
            entitlements.publish(root,row)
        row["activation_attempted_at"]=now
        row["activation_attempts"]=row.get("activation_attempts",0)+1
        persist(root,rows)
        try:
            if not row["enabled"]:start_stack(root,row)
            persist(root,rows)
            configure_route(row)
            if not operator_onboarding.finish_password(path,root,row,rows=rows):raise RuntimeError("Registration password unavailable")
            row["activation_attempts"]=0
            admin.audit(root,"automatic_trial",slug,"success")
        except Exception:
            admin.audit(root,"automatic_trial",slug,"failed")
        persist(root,rows)
        return True
    return False

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--root",type=Path,required=True)
    parser.add_argument("--inbox",type=Path,required=True)
    args=parser.parse_args()
    with tenantctl.registry(args.root) as rows:
        activate_one(args.root,args.inbox,rows)
if __name__=="__main__":main()
