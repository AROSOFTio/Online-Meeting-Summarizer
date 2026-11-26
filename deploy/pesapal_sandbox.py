"""Sandbox-only API 3 adapter. No live endpoint or payment credentials in source."""
import json
import os
from decimal import Decimal
from urllib.request import Request,build_opener,HTTPRedirectHandler
from urllib.parse import urlencode,urlsplit

BASE="https://cybqa.pesapal.com/pesapalv3/api"
class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None

class Gateway:
    def __init__(self):
        self.key=os.environ.get("CC_PESAPAL_SANDBOX_KEY","")
        self.secret=os.environ.get("CC_PESAPAL_SANDBOX_SECRET","")
        self.ipn=os.environ.get("CC_PESAPAL_SANDBOX_IPN_ID","")
        self.callback=os.environ.get("CC_PESAPAL_SANDBOX_CALLBACK","")
        self.token=None
        u=urlsplit(self.callback)
        if not all((self.key,self.secret,self.ipn)) or u.scheme!="https" or not u.hostname or u.username or u.password or u.fragment:
            raise RuntimeError("Sandbox gateway is not configured")
    def request(self,path,body=None,auth=True):
        headers={"Accept":"application/json","Content-Type":"application/json"}
        if auth:
            if not self.token:
                self.token=self.request("/Auth/RequestToken",{"consumer_key":self.key,"consumer_secret":self.secret},False).get("token")
                if not self.token:raise RuntimeError("Sandbox authentication failed")
            headers["Authorization"]="Bearer "+self.token
        req=Request(BASE+path,data=json.dumps(body).encode() if body is not None else None,headers=headers)
        with build_opener(NoRedirect()).open(req,timeout=20) as response:
            raw=response.read(1000001)
            if len(raw)>1000000:raise RuntimeError("Invalid gateway response")
            return json.loads(raw,parse_float=Decimal)
    def submit(self,inv,email):
        from billing import CURRENCIES
        if not inv["sandbox"]:raise ValueError("Sandbox invoices only")
        amount=Decimal(inv["amount_minor"])/10**CURRENCIES[inv["currency"]]
        return self.request("/Transactions/SubmitOrderRequest",{"id":inv["id"],"currency":inv["currency"],"amount":float(amount),"description":"ConveneCore sandbox subscription test","callback_url":self.callback,"notification_id":self.ipn,"billing_address":{"email_address":email}})
    def status(self,tracking_id):
        return self.request("/Transactions/GetTransactionStatus?"+urlencode({"orderTrackingId":tracking_id}))
