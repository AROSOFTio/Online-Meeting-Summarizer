#!/usr/bin/env python3
"""Unprivileged customer checkout HTTP listener; deploy behind dedicated HTTPS proxy."""
import argparse
import html
from http.server import HTTPServer,BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit,parse_qs
import checkout

CSS="""*{box-sizing:border-box}body{margin:0;background:#f5f7fa;color:#17243b;font:15px system-ui}header{padding:22px;background:#14263f;color:white;font-weight:700}main{max-width:540px;margin:32px auto;padding:16px}section{background:white;border:1px solid #dce4ed;border-radius:12px;padding:24px}h1{font-size:26px;margin-top:0}p{line-height:1.6;color:#52647a}strong.total{font-size:30px;display:block;margin:14px 0}label{display:block;margin-top:16px;font-weight:600}input,select{width:100%;padding:12px;margin:8px 0;border:1px solid #cbd5e1;border-radius:6px;font:inherit}input[type=checkbox]{width:auto}button,a.button{display:inline-block;border:0;background:#2359bd;color:white;border-radius:6px;padding:12px 18px;font:inherit;font-weight:600;text-decoration:none;margin-top:16px}small{color:#64748b}"""
def esc(v):return html.escape(str(v),quote=True)
def page(title,body):
    return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(title)+' | MinuteSeal</title><style>'+CSS+'</style><header>MinuteSeal · Secure subscription checkout</header><main><section><h1>'+esc(title)+'</h1>'+body+'</section></main></html>'
def render(data,token):
    status=data["status"]
    body='<p>'+esc(data["organization"])+' · '+esc(data["plan"].title())+' · '+esc(data["months"])+' month(s)<br>Invoice '+esc(data["invoice"])+'</p><strong class="total">UGX '+f'{data["amount"]:,}'+'</strong>'
    url="/checkout/"+token
    if status=="open":
        body+='<form method="post" action="'+url+'"><label>Mobile money provider<select name="provider" required>'+''.join('<option value="'+esc(p)+'">'+esc(checkout.PROVIDERS[p])+'</option>' for p in data["providers"])+'</select></label><label>Mobile number<input name="phone" type="tel" autocomplete="tel" maxlength="24" required placeholder="07xxxxxxxx"></label><label><input type="checkbox" name="confirm" value="yes" required> I authorize this exact payment request to my mobile money number.</label><button>Request payment</button></form><p><small>Approve only the matching amount on your phone. Never enter your mobile money PIN or OTP on this page.</small></p>'
    elif status=="paid":
        body+='<h2>Payment confirmed</h2><p>Receipt: '+esc(data["receipt"])+'<br>Subscription expiry: '+esc(data["expiry"])+'</p><p>Print this confirmation for your records. Contact your organization administrator for workspace access.</p>'
    elif status=="cancelled":body+='<p>This invoice was cancelled.</p>'
    else:
        labels={"queued":"Payment request queued. Check your phone after processing.","collection_pending":"Awaiting provider confirmation. Check your phone.","collection_unknown":"Provider confirmation pending. Do not submit another payment.","paid_pending_sync":"Payment verified; renewal publication pending.","review_required":"Payment request requires review. Contact support before retrying."}
        body+='<p role="status">'+esc(labels.get(status,"Payment under review."))+'</p><a class="button" href="'+url+'">Refresh payment status</a>'
    return page("Subscription checkout",body)

class Server(HTTPServer):
    def __init__(self,path,port,origin):
        self.inbox=path;self.origin=origin;self.host=urlsplit(origin).netloc
        super().__init__(("127.0.0.1",port),Handler)
class Handler(BaseHTTPRequestHandler):
    def setup(self):super().setup();self.connection.settimeout(15)
    def log_message(self,*args):pass
    def respond(self,body,status=200):
        raw=body.encode()
        self.send_response(status)
        for k,v in {"Content-Type":"text/html; charset=utf-8","Content-Length":str(len(raw)),"Cache-Control":"no-store","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY","Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'","X-Robots-Tag":"noindex, nofollow"}.items():self.send_header(k,v)
        self.end_headers();self.wfile.write(raw)
    def token(self):
        p=urlsplit(self.path).path
        return p.removeprefix("/checkout/") if p.startswith("/checkout/") else ""
    def do_GET(self):
        if self.headers.get("Host")!=self.server.host:return self.respond(page("Unavailable","Invalid host"),421)
        try:
            token=self.token();data=checkout.read(self.server.inbox,token)
            return self.respond(render(data,token) if data else page("Checkout unavailable","Ask your organization administrator for a valid invoice link."),200 if data else 404)
        except Exception:return self.respond(page("Unavailable","Checkout temporarily unavailable."),503)
    def do_POST(self):
        if self.headers.get("Host")!=self.server.host or self.headers.get("Origin")!=self.server.origin:return self.respond(page("Denied","Invalid origin"),403)
        try:
            n=int(self.headers.get("Content-Length","0"))
            if not 0<n<=4096 or self.headers.get("Content-Type","").split(";")[0]!="application/x-www-form-urlencoded":raise ValueError()
            form=parse_qs(self.rfile.read(n).decode(),max_num_fields=6)
            one=lambda k:form.get(k,[""])[0]
            token=self.token()
            checkout.queue(self.server.inbox,token,one("provider"),one("phone"),one("confirm")=="yes")
            self.send_response(303);self.send_header("Location","/checkout/"+token);self.send_header("Cache-Control","no-store");self.send_header("Referrer-Policy","no-referrer");self.end_headers()
        except ValueError:return self.respond(page("Payment request not accepted","Check your payment details or refresh the original checkout link. Do not submit a duplicate payment."),400)
        except Exception:return self.respond(page("Unavailable","Checkout temporarily unavailable."),503)

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--inbox",type=Path,required=True);p.add_argument("--origin",required=True);p.add_argument("--port",type=int,default=18792)
    args=p.parse_args();u=urlsplit(args.origin)
    if u.scheme!="https" or not u.hostname or u.username or u.password or u.path or u.query or u.fragment:p.error("Dedicated HTTPS origin required")
    with checkout.db(args.inbox):pass
    Server(args.inbox,args.port,args.origin).serve_forever()
if __name__=="__main__":main()
