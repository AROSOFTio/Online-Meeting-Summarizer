#!/usr/bin/env python3
"""Public registration listener. Run as a separate unprivileged account."""
import argparse
import html
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs,urlsplit

import onboarding

CSS="""*{box-sizing:border-box}body{margin:0;background:#f4f7fb;color:#16243a;font:15px system-ui,sans-serif}header{background:#14263f;color:#fff;padding:20px 5%;font-weight:700}main{max-width:900px;margin:36px auto;padding:0 18px}h1{font-size:32px;letter-spacing:-.7px;margin:8px 0}p{line-height:1.6;color:#52647a}nav{display:flex;flex-wrap:wrap;gap:18px;margin:20px 0}a{color:#2159bc}section{background:white;border:1px solid #dce4ef;border-radius:12px;padding:24px;margin:20px 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:15px}label{display:block;font-size:13px;font-weight:600}input,select{display:block;width:100%;border:1px solid #cbd5e1;border-radius:7px;padding:12px;margin:7px 0 12px;font:inherit;color:#16243a}button{border:0;background:#2359bd;color:white;border-radius:7px;padding:12px 20px;font:inherit;font-weight:600;cursor:pointer}code{overflow-wrap:anywhere;display:block;background:#eef3fa;padding:12px;border-radius:6px;margin:5px 0 16px}.note{font-size:13px}footer{max-width:900px;margin:20px auto;padding:0 18px;color:#64748b;font-size:13px}"""
def esc(v):return html.escape(str(v),quote=True)
def field(label,name,kind="text",maxlength=150):
    return f'<label>{esc(label)}<input name="{esc(name)}" type="{kind}" required maxlength="{maxlength}"></label>'
def select(label,name,options):
    return '<label>'+esc(label)+'<select name="'+name+'" required>'+''.join('<option value="'+esc(x)+'">'+esc(x.title() if name=="plan" else x)+'</option>' for x in options)+'</select></label>'
def page(title,body):
    return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(title)+' | MinuteSeal</title><style>'+CSS+'</style><header>MinuteSeal · Professional meeting management</header><main><h1>'+esc(title)+'</h1><nav><a href="/">Create organization</a><a href="/verify">Verify email</a><a href="/status">Track registration</a></nav>'+body+'</main><footer>Organization registration · Never submit meeting recordings or confidential documents here.</footer></html>'
def registration():
    return page("Create your organization",'<p>Request a dedicated meeting workspace for your institution. Email verification and platform approval are required before activation.</p><section><form method="post" action="/register"><div class="grid">'+field("Official organization name","name")+field("Administrator name","contact",maxlength=100)+field("Administrator email","email","email",254)+field("Preferred workspace identifier","slug",maxlength=40)+select("Organization type","sector",onboarding.SECTORS)+select("Requested subscription","plan",onboarding.PLANS)+'</div><p class="note">The requested plan and workspace identifier are subject to review. No payment is collected here. Your information will be used to verify and process this application.</p><button>Request workspace</button></form></section>')
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
        for k,v in {"Content-Type":"text/html; charset=utf-8","Content-Length":str(len(raw)),"Cache-Control":"no-store","Referrer-Policy":"no-referrer","X-Frame-Options":"DENY","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"}.items():
            self.send_header(k,v)
        self.end_headers()
        self.wfile.write(raw)
    def do_GET(self):
        if self.headers.get("Host")!=self.server.hostname:
            return self.respond(page("Unavailable","Invalid host"),421)
        view={"/":registration,"/verify":verify_page,"/status":status_page}.get(urlsplit(self.path).path)
        return self.respond(view() if view else page("Not found","Page not found"),200 if view else 404)
    def do_POST(self):
        if self.headers.get("Host")!=self.server.hostname or self.headers.get("Origin")!=self.server.origin:
            return self.respond(page("Request denied","Invalid request origin"),403)
        try:
            length=int(self.headers.get("Content-Length","0"))
            if not 0<length<=8192 or self.headers.get("Content-Type","").split(";")[0]!="application/x-www-form-urlencoded":
                raise ValueError("Invalid form.")
            f={k:v[0] for k,v in parse_qs(self.rfile.read(length).decode(),keep_blank_values=True,max_num_fields=16).items()}
            path=urlsplit(self.path).path
            if path=="/register":
                ref,key,sent=onboarding.register(self.server.inbox,f,self.server.origin)
                return self.respond(page("Registration received",'<section><p>'+("Check your email for the verification code." if sent else "Email delivery could not be confirmed. Use the tracking key to retry after one minute.")+'</p><strong>Registration reference</strong><code>'+esc(ref)+'</code><strong>Private tracking key</strong><code>'+esc(key)+'</code><p>Save both securely. The tracking key is not recoverable from the service.</p><a href="/verify">Verify email</a> · <a href="/status">Track registration</a></section>'))
            if path=="/verify":
                ok=onboarding.verify(self.server.inbox,f.get("ref",""),f.get("code",""))
                return self.respond(page("Email verified" if ok else "Verification unsuccessful",'<section><p>'+("Your application is awaiting platform approval." if ok else "Invalid, expired or already-used code. Check your registration or request a new code.")+'</p></section>'),200 if ok else 400)
            if path=="/resend":
                onboarding.resend(self.server.inbox,f.get("ref",""),f.get("key",""),self.server.origin)
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
    args=p.parse_args()
    u=urlsplit(args.origin)
    if u.scheme!="https" or not u.hostname or u.username or u.password or u.path or u.query or u.fragment:
        p.error("Provide a dedicated HTTPS origin without a trailing slash.")
    with onboarding.database(args.inbox):pass
    Server(args.inbox,args.port,args.origin).serve_forever()
if __name__=="__main__":main()
