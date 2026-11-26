#!/usr/bin/env python3
"""Public registration listener. Run as a separate unprivileged account."""
import argparse
import html
import os
import re
from http.cookies import SimpleCookie, CookieError
from datetime import datetime,timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs,urlsplit

import onboarding

CSS="""*{box-sizing:border-box}body{margin:0;font:15px/1.5 system-ui,sans-serif;background:#fff;color:#0f172a}a{color:#1d4ed8}main.ms-public-content{flex:1;padding-top:20px;padding-bottom:30px}.reg-nav{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px}.reg-nav a{padding:8px 12px;border:1px solid #e2e8f0;border-radius:5px;font-size:13px;font-weight:600;text-decoration:none}.reg-nav a[aria-current=page]{background:#eff6ff;border-color:#bfdbfe}.reg-body>p{margin:0 0 12px;color:#475569}.reg-body section{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:14px 0;max-width:100%}.reg-body .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 18px}.reg-body label{display:block;font-size:13px;font-weight:600;min-width:0}.reg-body input,.reg-body select{display:block;width:100%;min-width:0;border:1px solid #94a3b8;border-radius:5px;padding:9px 11px;margin:5px 0 9px;font:inherit;font-size:14px;color:#0f172a;background:#fff}.reg-body button{border:1px solid #1d4ed8;background:#1d4ed8;color:#fff;border-radius:5px;padding:10px 16px;font:600 14px system-ui;cursor:pointer}.reg-body code{overflow-wrap:anywhere;display:block;background:#f1f5f9;padding:12px;border-radius:5px;margin:5px 0 16px}.reg-body .note{font-size:13px;color:#475569}.reg-body p[role=status]{padding:12px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:5px}.reg-body section>p{margin-top:0;color:#475569}.reg-body section form{margin:0}.reg-body section form>button{margin-top:6px}@media(max-width:639px){.reg-body .grid{grid-template-columns:1fr;gap:5px}.reg-body section{padding:15px}.reg-body input,.reg-body select{font-size:16px}.reg-nav{gap:5px}.reg-nav a{padding:7px 8px;font-size:12px}}
body.ms-page{background:#f8fafc;font-family:Arial,system-ui,sans-serif}
.reg-nav{justify-content:flex-end;gap:14px;margin:0 0 18px}
.reg-nav a{border:0;background:transparent;padding:8px 0;color:#475569;font-weight:600}
.reg-nav a[aria-current=page]{background:transparent;color:#1d4ed8;border-bottom:2px solid #1d4ed8;border-radius:0}
.reg-body{max-width:920px;margin-inline:auto}
.reg-body .wizard-card{padding:0;overflow:hidden;margin:0 0 16px;border-color:#dbe2ea;border-radius:10px}
.wizard-top{padding:22px 28px 0;border-bottom:1px solid #e2e8f0}
.wizard-top h2{font-size:21px;letter-spacing:-.35px;line-height:1.3;margin:0 0 5px;font-weight:650}
.wizard-top p{margin:0;color:#64748b;font-size:13px}
.wizard-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));padding:0;margin:21px 0 0;list-style:none;gap:8px}
.wizard-steps button{display:flex;align-items:center;gap:9px;width:100%;text-align:left;background:transparent;color:#64748b;border:0;border-bottom:3px solid transparent;border-radius:0;padding:0 0 13px;min-width:0;font:600 13px Arial,system-ui,sans-serif}
.wizard-steps button:disabled{cursor:default;opacity:1}
.wizard-steps button[aria-current=step]{color:#1d4ed8;border-bottom-color:#1d4ed8}
.wizard-steps .step-no{display:grid;place-items:center;flex:0 0 28px;height:28px;border:1px solid #dbe2ea;border-radius:50%;background:#f1f5f9;font-size:12px;color:#475569}
.wizard-steps button[aria-current=step] .step-no{background:#1d4ed8;color:#fff;border-color:#1d4ed8}
.wizard-steps button[data-complete=true] .step-no{background:#eff6ff;color:#1d4ed8;border-color:#bfdbfe}
.wizard-panel{border:0;padding:24px 28px;margin:0;min-width:0}
.wizard-panel[hidden],.wizard-actions[hidden],.wizard-steps[hidden],.wizard-review[hidden],.wizard-actions button[hidden],.wizard-fallback[hidden]{display:none!important}
.wizard-panel h3{font-size:18px;line-height:1.35;font-weight:650;margin:0 0 5px;letter-spacing:-.2px}
.wizard-panel>p{font-size:13px;color:#64748b;margin:0 0 22px}
.reg-body .wizard-panel label{font-size:14px;line-height:1.4;font-weight:600}
.reg-body .wizard-panel input,.reg-body .wizard-panel select{font:400 15px Arial,system-ui,sans-serif;min-height:47px;border:1px solid #cbd5e1;border-radius:6px;padding:12px;margin:7px 0 0;background:#fff;color:#0f172a}
.reg-body .wizard-panel input::placeholder{color:#788596;opacity:1}
.reg-body .wizard-panel input:focus,.reg-body .wizard-panel select:focus{outline:2px solid #bfdbfe;outline-offset:1px;border-color:#2563eb}
.reg-body .wizard-panel .grid{gap:19px}
.wizard-hint{font-size:12px;color:#64748b;display:block;margin:7px 0 0;font-weight:400}
.wizard-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;border-top:1px solid #e2e8f0;padding:17px 28px;background:#fff}
.wizard-actions .wizard-back{background:#fff;color:#334155;border:1px solid #cbd5e1}
.wizard-actions .wizard-next,.wizard-actions .wizard-submit{min-width:132px;min-height:43px}
.wizard-actions .wizard-count{font-size:12px;color:#64748b}
.wizard-review{margin-top:22px;padding:15px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px}
.wizard-review h4{font-size:13px;margin:0 0 8px}
.wizard-review dl{margin:0;display:grid;grid-template-columns:1fr 1fr;gap:7px 12px;font-size:13px}
.wizard-review dt{color:#64748b}
.wizard-review dd{margin:0;overflow-wrap:anywhere;font-weight:500}
.wizard-notice{padding:12px 15px;margin:0 0 14px;border:1px solid #dbeafe;border-radius:6px;background:#eff6ff;color:#334155;font-size:13px}
.wizard-legal{font-size:12px;color:#64748b;margin:16px 0 0;line-height:1.5}
.wizard-fallback{padding:0 28px 20px}
@media(max-width:639px){.reg-nav{justify-content:flex-start;gap:12px;margin-bottom:12px}.reg-nav a{padding:5px 0;font-size:12px}.wizard-top{padding:18px 16px 0}.wizard-top h2{font-size:19px}.wizard-steps{gap:5px;margin-top:18px}.wizard-steps button{flex-direction:column;align-items:center;gap:5px;font-size:11px;line-height:1.3;text-align:center;padding-bottom:10px}.wizard-panel{padding:20px 16px}.wizard-panel>p{margin-bottom:17px}.reg-body .wizard-panel .grid{gap:15px}.reg-body .wizard-panel input,.reg-body .wizard-panel select{font-size:16px}.wizard-actions{padding:15px 16px;gap:8px}.wizard-actions .wizard-next,.wizard-actions .wizard-submit{min-width:0}.wizard-actions .wizard-count{font-size:11px}.wizard-fallback{padding-inline:16px}}

body.ms-page{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.reg-body{max-width:none}
.reg-body .wizard-card{display:grid;grid-template-columns:minmax(0,.78fr) minmax(0,1.22fr);min-height:385px}
.wizard-visual{position:relative;isolation:isolate;min-width:0;display:flex;flex-direction:column;justify-content:flex-end;background:#103a91;color:white;padding:26px;overflow:hidden}
.wizard-visual img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2}
.wizard-visual:before{content:"";position:absolute;inset:0;background:rgba(16,58,145,.68);z-index:-1}
.wizard-visual h2{font-size:26px;font-weight:650;line-height:1.2;letter-spacing:-.5px;margin:0;max-width:250px}
.wizard-visual p{font-size:13px;line-height:1.5;margin:10px 0 0;color:#eff6ff}
.wizard-form-side{min-width:0;background:#fff}
.wizard-form-side .wizard-panel .grid{grid-template-columns:minmax(0,1fr);gap:15px}
.wizard-top{padding:22px 24px 0}
.wizard-panel{padding:20px 24px}
.wizard-panel>p{margin-bottom:16px}
.wizard-actions{padding:15px 24px}
.wizard-steps button{font-family:inherit;gap:6px;font-size:12px}
.reg-body .wizard-panel input,.reg-body .wizard-panel select{font-family:inherit}
.wizard-form-side .wizard-notice{margin:0 24px 10px}
@media(max-width:950px){.reg-body .wizard-card{grid-template-columns:1fr}.wizard-visual{display:none}.wizard-form-side .wizard-panel .grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:639px){.wizard-form-side .wizard-panel .grid{grid-template-columns:1fr}.wizard-top{padding:18px 16px 0}.wizard-panel{padding:18px 16px}.wizard-actions{padding:15px 16px}.wizard-form-side .wizard-notice{margin-inline:16px}.wizard-steps button{font-size:11px}.wizard-steps .step-no{flex-basis:28px}}
.otp-card{max-width:480px;margin-inline:auto!important;padding:24px!important}.otp-card h2{font-size:21px;margin:0 0 9px}.otp-card .otp-input{font-size:22px;letter-spacing:.35em;text-align:center;min-height:49px}.otp-card .otp-resend{margin-top:12px}.otp-card .otp-resend button{background:#fff;color:#1d4ed8;border-color:#cbd5e1}.otp-card .note{margin-top:16px}
"""
BASE=""
def esc(v):return html.escape(str(v),quote=True)
def field(label,name,kind="text",maxlength=150):
    return f'<label>{esc(label)}<input name="{esc(name)}" type="{kind}" required maxlength="{maxlength}"></label>'
def select(label,name,options):
    return '<label>'+esc(label)+'<select name="'+name+'" required>'+''.join('<option value="'+esc(x)+'">'+esc(x.title() if name=="plan" else x)+'</option>' for x in options)+'</select></label>'
PUBLIC_LINKS=(("/", "Home"),("/features","Features"),("/solutions","Solutions"),("/how-it-works","How it works"),("/templates","Templates"))

def brand_header():
    links=''.join('<a href="'+href+'">'+label+'</a>' for href,label in PUBLIC_LINKS)
    return '<header class="ms-header"><div class="ms-shell-inner ms-header-row"><a href="/" class="ms-brand"><img src="/minuteseal.svg" alt="" width="40" height="40"><span>Minute<b>Seal</b></span></a><nav class="ms-primary-nav" aria-label="Main navigation">'+links+'</nav><div class="ms-header-actions"><a href="/login" class="ms-button ms-button-outline">Sign in</a><a href="'+BASE+'/" class="ms-button ms-register-desktop" aria-current="page">Register organization</a><details class="ms-mobile-menu"><summary class="ms-menu-toggle" aria-label="Toggle navigation"><svg class="ms-menu-open-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg><svg class="ms-menu-close-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></summary><button type="button" class="ms-menu-backdrop" aria-label="Close navigation" tabindex="-1"></button><nav class="ms-mobile-links" aria-label="Mobile navigation"><div class="ms-drawer-brand"><img src="/minuteseal.svg" alt=""><span>Minute<b>Seal</b></span></div>'+links+'<a href="'+BASE+'/" class="ms-button" aria-current="page">Register organization</a><a href="/setup" class="ms-drawer-secondary">Activate workspace</a></nav></details></div></div></header>'

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
    nav=""
    hero='<section data-page-hero="true" class="ms-public-hero ms-hero-compact"><img class="ms-hero-image" src="/images/heroes/'+group+'.webp" alt="" aria-hidden="true"><div class="ms-hero-overlay" aria-hidden="true"></div><div class="ms-hero-content"><h1 class="ms-hero-title">'+esc(title)+'</h1><p class="ms-hero-description">'+esc(description)+'</p></div></section>'
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(title)+' | MinuteSeal</title><link rel="icon" href="/minuteseal.svg"><link rel="stylesheet" href="/minuteseal-public.css?v=4"><script src="/minuteseal-menu.js?v=1" defer></script><script src="/minuteseal-registration.js?v=1" defer></script><style>'+CSS+'</style></head><body class="ms-page">'+brand_header()+hero+'<main class="ms-public-content">'+nav+'<div class="reg-body">'+body+'</div></main>'+brand_footer()+'</body></html>'

def wizard_field(label,name,placeholder,kind="text",maxlength=150,extra=""):
    return f'<label>{esc(label)}<input name="{esc(name)}" type="{kind}" required maxlength="{maxlength}" placeholder="{esc(placeholder)}" {extra}></label>'

def registration():
    email_ready=bool(os.environ.get("CC_ONBOARD_SMTP_HOST") and os.environ.get("CC_ONBOARD_SMTP_FROM"))
    notice="" if email_ready else '<div class="wizard-notice" role="status">Email delivery is temporarily unavailable. You can request a verification code again when service is restored.</div>'
    steps='<ol class="wizard-steps" aria-label="Registration progress" hidden>'+''.join(f'<li><button type="button" data-go="{i}" disabled><span class="step-no">{i+1}</span><span>{label}</span></button></li>' for i,label in enumerate(("Organization","Administrator","Workspace")))+'</ol>'
    organization='<div class="wizard-panel" data-step="0"><h3 tabindex="-1">Organization details</h3><p>Tell us about your organization.</p><div class="grid">'+wizard_field("Organization name","name","e.g. Kampala Business Group",extra='autocomplete="organization" minlength="2"')+select("Organization type","sector",onboarding.SECTORS)+'</div></div>'
    administrator='<div class="wizard-panel" data-step="1"><h3 tabindex="-1">Administrator details</h3><p>Who will manage the workspace?</p><div class="grid">'+wizard_field("Full name","contact","Full name",maxlength=100,extra='autocomplete="name" minlength="2"')+wizard_field("Work email","email","name@organization.com","email",254,extra='autocomplete="email"')+'</div><p class="wizard-legal">This email will be used for verification and account activation.</p></div>'
    workspace='<div class="wizard-panel" data-step="2"><h3 tabindex="-1">Workspace preferences</h3><p>Choose an identifier and a subscription.</p><div class="grid">'+wizard_field("Workspace identifier","slug","e.g. kampala-group",maxlength=40,extra='pattern="[a-z][a-z0-9\\-]{1,39}" title="2–40 lowercase letters, numbers or hyphens; start with a letter." autocapitalize="none" spellcheck="false" minlength="2"')+select("Requested subscription","plan",onboarding.PLANS)+'</div><span class="wizard-hint">The identifier will be used in your workspace address, subject to approval.</span><div class="wizard-review" hidden><h4>Review your details</h4><dl><dt>Organization</dt><dd data-review="name"></dd><dt>Administrator</dt><dd data-review="contact"></dd><dt>Email</dt><dd data-review="email"></dd></dl></div><p class="wizard-legal">No payment is collected now. Verify your email to continue.</p></div>'
    return page("Create your organization",'<section class="wizard-card"><aside class="wizard-visual" aria-label="MinuteSeal workspace"><img src="/images/heroes/register.webp" alt=""><h2>Better meetings start here.</h2><p>One workspace for minutes, decisions and follow-up.</p></aside><div class="wizard-form-side"><div class="wizard-top"><h2>Register your workspace</h2><p>Complete your application in three steps.</p>'+steps+'</div>'+notice+'<form method="post" action="/register" data-wizard>'+organization+administrator+workspace+'<div class="wizard-actions" hidden><button type="button" class="wizard-back">Back</button><span class="wizard-count" aria-live="polite">Step 1 of 3</span><button type="button" class="wizard-next">Continue →</button><button type="submit" class="wizard-submit" hidden>Request workspace</button></div><div class="wizard-fallback"><button type="submit">Request workspace</button></div></form></div></section>')
def verify_page(state=None,message=""):
    if not state:
        return page("Verify your email",'<section><p>Start registration in this browser to receive your verification code.</p><a href="/">Register organization</a></section>')
    if state["status"]!="unverified":
        return verified_page(state)
    alert='<p role="status">'+esc(message)+'</p>' if message else ''
    return page("Verify your email",'<section class="otp-card"><h2>Enter your verification code</h2><p>Check your email: '+esc(state["email"])+'</p>'+alert+'<form method="post" action="/verify"><label>Six-digit code<input class="otp-input" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" placeholder="000000" required></label><button>Verify email</button></form><form method="post" action="/resend" class="otp-resend"><button>Resend code</button></form><p class="note">Codes expire in 10 minutes. Wait 60 seconds before requesting another code.</p></section>')

def verified_page(state):
    if state["status"]=="rejected":
        return page("Registration unavailable",'<section><p>This workspace request could not be activated. Contact support.</p></section>')
    host=state.get("host")
    if host and onboarding.SLUG.fullmatch(host.split(".")[0]) and re.fullmatch(r"[a-z0-9.-]+",host):
        return page("Workspace ready",'<section><p>Your workspace is ready. Use the setup invitation sent to your email to finish activating your account.</p><a href="https://'+esc(host)+'/setup">Open workspace</a></section>')
    return page("Email verified",'<section class="otp-card"><h2>Email verified</h2><p>Your organization is awaiting workspace activation. We will email you when your workspace is ready.</p></section>')

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
    def respond(self,body,status=200,cookie=None,location=None):
        raw=body.encode()
        self.send_response(status)
        for k,v in {"Content-Type":"text/html; charset=utf-8","Content-Length":str(len(raw)),"Cache-Control":"no-store","Referrer-Policy":"same-origin","X-Frame-Options":"DENY","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"}.items():
            self.send_header(k,v)
        if cookie:self.send_header("Set-Cookie",cookie)
        if location:self.send_header("Location",location)
        self.end_headers()
        self.wfile.write(raw)
    def route_path(self):
        path=urlsplit(self.path).path
        if BASE and (path==BASE or path.startswith(BASE+"/")):
            return path[len(BASE):] or "/"
        if BASE:return None
        return path
    def browser_session(self):
        try:
            jar=SimpleCookie(self.headers.get("Cookie",""))
            value=jar["__Host-ms-registration"].value
            ref,key=value.split(".",1)
            if onboarding.REF.fullmatch(ref) and onboarding.TOKEN.fullmatch(key):
                return ref,key
        except (CookieError,KeyError,ValueError):
            pass
        return "",""
    def do_GET(self):
        if self.headers.get("Host")!=self.server.hostname:
            return self.respond(page("Unavailable","Invalid host"),421)
        path=self.route_path()
        if path=="/verify":
            return self.respond(verify_page(onboarding.browser_state(self.server.inbox,*self.browser_session())))
        if path=="/status":
            return self.respond("",303,location=BASE+"/verify")
        view={"/":registration}.get(path)
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
                ref,key,sent=onboarding.register_browser(self.server.inbox,f)
                cookie="__Host-ms-registration="+ref+"."+key+"; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=86400"
                state=onboarding.browser_state(self.server.inbox,ref,key)
                return self.respond(verify_page(state,"Verification code sent." if sent else "Email delivery is currently unavailable. Try Resend code later."),cookie=cookie)
            if path in ("/verify","/resend"):
                ref,key=self.browser_session()
                state=onboarding.browser_state(self.server.inbox,ref,key)
                if not state:return self.respond(verify_page(),400)
                if state["status"]!="unverified":return self.respond(verified_page(state))
                if path=="/resend":
                    sent=onboarding.resend_browser(self.server.inbox,ref,key)
                    return self.respond(verify_page(state,"A new code was sent." if sent else "Code could not be sent yet. Wait a minute and try again."),200)
                ok=onboarding.verify_browser(self.server.inbox,ref,key,f.get("code",""))
                if ok:return self.respond(verified_page(onboarding.browser_state(self.server.inbox,ref,key)))
                return self.respond(verify_page(state,"Invalid or expired code. Request a new code after five failed attempts."),400)
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
