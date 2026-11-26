#!/usr/bin/env python3
"""Public registration listener. Run as a separate unprivileged account."""
import argparse
import html
import os
import re
from datetime import datetime,timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs,urlsplit

import onboarding

CSS="""*{box-sizing:border-box}body{margin:0;font:15px/1.5 system-ui,sans-serif;background:#fff;color:#0f172a}a{color:#1d4ed8}main.ms-public-content{flex:1;padding-top:20px;padding-bottom:30px}.reg-nav{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px}.reg-nav a{padding:8px 12px;border:1px solid #e2e8f0;border-radius:5px;font-size:13px;font-weight:600;text-decoration:none}.reg-nav a[aria-current=page]{background:#eff6ff;border-color:#bfdbfe}.reg-body>p{margin:0 0 12px;color:#475569}.reg-body section{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:14px 0;max-width:100%}.reg-body .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 18px}.reg-body label{display:block;font-size:13px;font-weight:600;min-width:0}.reg-body input,.reg-body select{display:block;width:100%;min-width:0;border:1px solid #94a3b8;border-radius:5px;padding:9px 11px;margin:5px 0 9px;font:inherit;font-size:14px;color:#0f172a;background:#fff}.reg-body button{border:1px solid #1d4ed8;background:#1d4ed8;color:#fff;border-radius:5px;padding:10px 16px;font:600 14px system-ui;cursor:pointer}.reg-body code{overflow-wrap:anywhere;display:block;background:#f1f5f9;padding:12px;border-radius:5px;margin:5px 0 16px}.reg-body .note{font-size:13px;color:#475569}.reg-body p[role=status]{padding:12px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:5px}.reg-body section>p{margin-top:0;color:#475569}.reg-body section form{margin:0}.reg-body section form>button{margin-top:6px}@media(max-width:639px){.reg-body .grid{grid-template-columns:1fr;gap:5px}.reg-body section{padding:15px}.reg-body input,.reg-body select{font-size:16px}.reg-nav{gap:5px}.reg-nav a{padding:7px 8px;font-size:12px}}"""
BASE=""
def esc(v):return html.escape(str(v),quote=True)
def field(label,name,kind="text",maxlength=150):
    return f'<label>{esc(label)}<input name="{esc(name)}" type="{kind}" required maxlength="{maxlength}"></label>'
def select(label,name,options):
    return '<label>'+esc(label)+'<select name="'+name+'" required>'+''.join('<option value="'+esc(x)+'">'+esc(x.title() if name=="plan" else x)+'</option>' for x in options)+'</select></label>'
PUBLIC_LINKS=(("/", "Home"),("/features","Features"),("/solutions","Solutions"),("/how-it-works","How it works"),("/templates","Templates"))

def brand_header():
    links=''.join('<a href="'+href+'">'+label+'</a>' for href,label in PUBLIC_LINKS)
    return '<header class="ms-header"><div class="ms-shell-inner ms-header-row"><a href="/" class="ms-brand"><img src="/minuteseal.svg" alt="" width="40" height="40"><span>Minute<b>Seal</b></span></a><nav class="ms-primary-nav" aria-label="Main navigation">'+links+'</nav><div class="ms-header-actions"><a href="/login" class="ms-button ms-button-outline">Sign in</a><a href="'+BASE+'/" class="ms-button ms-register-desktop" aria-current="page">Register organization</a><details class="ms-mobile-menu"><summary class="ms-menu-toggle" aria-label="Open navigation"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></summary><nav class="ms-mobile-links" aria-label="Mobile navigation">'+links+'<a href="'+BASE+'/" class="ms-button" aria-current="page">Register organization</a><a href="/setup">Activate workspace</a></nav></details></div></div></header>'

def brand_footer():
    links=''.join('<a href="'+href+'">'+label+'</a>' for href,label in PUBLIC_LINKS[1:])
    return '<footer class="ms-footer"><div class="ms-shell-inner ms-footer-row"><span>© '+str(datetime.now(timezone.utc).year)+' MinuteSeal</span><nav class="ms-footer-nav" aria-label="Footer navigation">'+links+'<a href="'+BASE+'/">Register organization</a><a href="/join-meeting">Join a meeting</a><a href="/login">Sign in</a></nav></div></footer>'

def page(title,body):
    # Only registration-owned links are prefixed; public navigation is separate.
    body=re.sub(r'\b(href|action|formaction)="/([^"]*)"',lambda m:m.group(1)+'="'+BASE+"/"+m.group(2)+'"',body)
    if BASE:
        body=body.replace('action="'+BASE+'/register"','action="'+BASE+'/"')
    group="verify" if title in ("Verify your email","Email verified","Verification unsuccessful","Verification request") else "status" if title in ("Track registration","Registration status","Registration unavailable","Registration received") else "register"
    description={"register":"Create a workspace for your organization.","verify":"Confirm your administrator email.","status":"Check your application progress."}[group]
    nav_links=[("register",BASE+"/","Create organization"),("verify",BASE+"/verify","Verify email"),("status",BASE+"/status","Track registration")]
    nav='<nav class="reg-nav" aria-label="Registration navigation">'+''.join('<a href="'+href+'"'+(' aria-current="page"' if key==group else '')+'>'+label+'</a>' for key,href,label in nav_links)+'</nav>'
    hero='<section data-page-hero="true" class="ms-public-hero"><img class="ms-hero-image" src="/images/heroes/'+group+'.webp" alt="" aria-hidden="true"><div class="ms-hero-overlay" aria-hidden="true"></div><div class="ms-hero-content"><h1 class="ms-hero-title">'+esc(title)+'</h1><p class="ms-hero-description">'+esc(description)+'</p></div></section>'
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(title)+' | MinuteSeal</title><link rel="icon" href="/minuteseal.svg"><link rel="stylesheet" href="/minuteseal-public.css?v=2"><style>'+CSS+'</style></head><body class="ms-page">'+brand_header()+hero+'<main class="ms-public-content">'+nav+'<div class="reg-body">'+body+'</div></main>'+brand_footer()+'</body></html>'

def registration():
    email_ready=bool(os.environ.get("CC_ONBOARD_SMTP_HOST") and os.environ.get("CC_ONBOARD_SMTP_FROM"))
    notice="" if email_ready else '<p class="note" role="status">Email verification is temporarily unavailable. Submit your application and save your tracking reference.</p>'
    return page("Create your organization",'<p>Email verification and approval are required before activation.</p>'+notice+'<section><form method="post" action="/register"><div class="grid">'+field("Official organization name","name")+field("Administrator name","contact",maxlength=100)+field("Administrator email","email","email",254)+field("Preferred workspace identifier","slug",maxlength=40)+select("Organization type","sector",onboarding.SECTORS)+select("Requested subscription","plan",onboarding.PLANS)+'</div><p class="note">No payment is collected here. Your details are used to review your application.</p><button>Request workspace</button></form></section>')
def verify_page():
    return page("Verify your email",'<section><p>Enter the reference and single-use verification code from your email.</p><form method="post" action="/verify">'+field("Registration reference","ref",maxlength=32)+field("Verification code","code","password",43)+'<button>Verify email</button></form></section>')
def status_page():
    return page("Track registration",'<section><p>Use the private tracking key shown after registration. Keep it confidential.</p><form method="post" action="/status">'+field("Registration reference","ref",maxlength=32)+field("Private tracking key","key","password",43)+'<button>Check status</button> <button formaction="/resend">Resend verification</button></form></section>')
class Server(HTTPServer):
    def __init__(self,path,port,origin):
        self.inbox=path
        self.origin=origin
        self.hostname=urlsplit(origin).netloc
        super().__init__(("127.0.0.1",port),Handler)
class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(15)
    def log_message(self,*args):pass
    def respond(self,body,status=200):
        raw=body.encode()
        self.send_response(status)
        for k,v in {"Content-Type":"text/html; charset=utf-8","Content-Length":str(len(raw)),"Cache-Control":"no-store","Referrer-Policy":"no-referrer","X-Frame-Options":"DENY","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"}.items():
            self.send_header(k,v)
        self.end_headers()
        self.wfile.write(raw)
    def route_path(self):
        path=urlsplit(self.path).path
        if BASE and (path==BASE or path.startswith(BASE+"/")):
            return path[len(BASE):] or "/"
        if BASE:return None
        return path
    def do_GET(self):
        if self.headers.get("Host")!=self.server.hostname:
            return self.respond(page("Unavailable","Invalid host"),421)
        view={"/":registration,"/verify":verify_page,"/status":status_page}.get(self.route_path())
        return self.respond(view() if view else page("Not found","Page not found"),200 if view else 404)
    def do_POST(self):
        if self.headers.get("Host")!=self.server.hostname or self.headers.get("Origin")!=self.server.origin:
            return self.respond(page("Request denied","Invalid request origin"),403)
        try:
            length=int(self.headers.get("Content-Length","0"))
            if not 0<length<=8192 or self.headers.get("Content-Type","").split(";")[0]!="application/x-www-form-urlencoded":
                raise ValueError("Invalid form.")
            f={k:v[0] for k,v in parse_qs(self.rfile.read(length).decode(),keep_blank_values=True,max_num_fields=16).items()}
            path=self.route_path()
            if path=="/register" or (BASE and path=="/"):
                ref,key,sent=onboarding.register(self.server.inbox,f,self.server.origin+BASE)
                return self.respond(page("Registration received",'<section><p>'+("Check your email for the verification code." if sent else "Email delivery could not be confirmed. Use the tracking key to retry after one minute.")+'</p><strong>Registration reference</strong><code>'+esc(ref)+'</code><strong>Private tracking key</strong><code>'+esc(key)+'</code><p>Save both securely. The tracking key is not recoverable from the service.</p><a href="/verify">Verify email</a> · <a href="/status">Track registration</a></section>'))
            if path=="/verify":
                ok=onboarding.verify(self.server.inbox,f.get("ref",""),f.get("code",""))
                return self.respond(page("Email verified" if ok else "Verification unsuccessful",'<section><p>'+("Your application is awaiting platform approval." if ok else "Invalid, expired or already-used code. Check your registration or request a new code.")+'</p></section>'),200 if ok else 400)
            if path=="/resend":
                onboarding.resend(self.server.inbox,f.get("ref",""),f.get("key",""),self.server.origin+BASE)
                return self.respond(page("Verification request",'<section><p>If the reference and key are valid and eligible, a new verification email has been requested.</p></section>'))
            if path=="/status":
                row=onboarding.get_status(self.server.inbox,f.get("ref",""),f.get("key",""))
                if not row:return self.respond(page("Registration unavailable","Invalid reference or tracking key."),404)
                labels={"unverified":"Email verification required","verified":"Awaiting platform review","provisioned":"Workspace provisioned; activation pending","setup_sent":"Administrator setup invitation sent","rejected":"Application declined"}
                body='<section><p>'+esc(labels.get(row["status"],"Under review"))+'</p>'
                if row["host"] and onboarding.SLUG.fullmatch(row["host"].split(".")[0]) and all(c.isalnum() or c in ".-" for c in row["host"]):
                    body+='<p>Workspace: <a href="https://'+esc(row["host"])+'/setup">'+esc(row["host"])+'</a></p>'
                return self.respond(page("Registration status",body+'</section>'))
            return self.respond(page("Not found","Page not found"),404)
        except ValueError as e:
            return self.respond(page("Check your information",'<section><p>'+esc(str(e))+'</p><a href="/">Return to registration</a></section>'),400)
        except Exception:
            return self.respond(page("Temporarily unavailable","Registration service is unavailable. Try again later."),503)
def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--inbox",type=Path,required=True)
    p.add_argument("--origin",required=True)
    p.add_argument("--port",type=int,default=18791)
    p.add_argument("--prefix",default="")
    args=p.parse_args()
    global BASE
    if args.prefix not in ("","/register"):p.error("Unsupported registration prefix")
    BASE=args.prefix
    u=urlsplit(args.origin)
    if u.scheme!="https" or not u.hostname or u.username or u.password or u.path or u.query or u.fragment:
        p.error("Provide a dedicated HTTPS origin without a trailing slash.")
    with onboarding.database(args.inbox):pass
    Server(args.inbox,args.port,args.origin).serve_forever()
if __name__=="__main__":main()
