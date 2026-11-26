"""Production collection-only adapters. Credentials never enter tenant workspaces."""
import hashlib
import json
import os
import re
import uuid
from decimal import Decimal
from pathlib import Path
from urllib.parse import urlencode, quote
from urllib.request import Request, build_opener, HTTPRedirectHandler
from xml.etree import ElementTree as ET
import tenantctl

PROVIDERS={"yo":("username","password"),"iotec":("client_id","client_secret","wallet_id")}
LABELS={"yo":"Yo! Uganda","iotec":"ioTec Pay"}
YO_URL="https://paymentsapi1.yo.co.ug/ybs/task.php"
IOTEC_API="https://pay.iotec.io/api"
IOTEC_TOKEN="https://id.iotec.io/connect/token"

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None

def request(url,body=None,headers=None):
    with build_opener(NoRedirect()).open(Request(url,data=body,headers=headers or {}),timeout=20) as response:
        raw=response.read(1000001)
        if len(raw)>1000000:raise RuntimeError("Unexpected gateway response")
        return raw

def path(root):return Path(root)/"payment-gateways.json"

def load(root):
    p=path(root)
    if not p.exists():return {}
    if p.is_symlink() or p.stat().st_mode&0o077:raise RuntimeError("Unsafe payment credential permissions")
    return json.loads(p.read_text())

def configure(root,provider,values,enabled=False,make_default=False):
    if provider not in PROVIDERS:raise ValueError("Unknown gateway")
    config=load(root)
    old=config.get(provider,{})
    new={}
    for key in PROVIDERS[provider]:
        value=values.get(key,"").strip() or old.get(key,"")
        if not value or len(value)>512 or any(ord(c)<32 for c in value):raise ValueError("Missing or invalid gateway credential")
        new[key]=value
    if provider=="iotec":new["wallet_id"]=str(uuid.UUID(new["wallet_id"]))
    new["enabled"]=bool(enabled)
    # Keep the merchant identity stable for existing pending payments. Secret rotation is allowed.
    new["account_id"]=hashlib.sha256((provider+":"+new[PROVIDERS[provider][0]]+":"+new.get("wallet_id","")).encode()).hexdigest()
    config[provider]=new
    if make_default:
        if not enabled:raise ValueError("Enable the default gateway first")
        config["default"]=provider
    elif config.get("default")==provider and not enabled:config.pop("default",None)
    tenantctl.private_write(path(root),json.dumps(config,indent=2)+"\n")
    return public_config(root)

def public_config(root):
    c=load(root)
    return {p:{"configured":bool(c.get(p)),"enabled":bool(c.get(p,{}).get("enabled")),"default":c.get("default")==p} for p in PROVIDERS}

def phone(value):
    value=re.sub(r"[\s()+-]","",value)
    if re.fullmatch(r"07\d{8}",value):value="256"+value[1:]
    if not re.fullmatch(r"2567\d{8}",value):raise ValueError("Enter a valid Uganda mobile number")
    return value

class Yo:
    def __init__(self,c):self.c=c
    def call(self,method,**fields):
        root=ET.Element("AutoCreate")
        node=ET.SubElement(root,"Request")
        for k,v in {"APIUsername":self.c["username"],"APIPassword":self.c["password"],"Method":method,**fields}.items():
            ET.SubElement(node,k).text=str(v)
        raw=request(YO_URL,ET.tostring(root,encoding="utf-8",xml_declaration=True),{"Content-Type":"text/xml","Accept":"text/xml"})
        if b"<!DOCTYPE" in raw.upper() or b"<!ENTITY" in raw.upper():raise RuntimeError("Invalid XML response")
        response=ET.fromstring(raw).find("Response")
        if response is None:raise RuntimeError("Invalid gateway response")
        return {el.tag:el.text or "" for el in response}
    def test(self):
        result=self.call("acacctbalance")
        if result.get("Status")!="OK" or result.get("StatusCode")!="0":raise RuntimeError("Gateway authentication failed")
    def submit(self,inv,number):
        result=self.call("acdepositfunds",NonBlocking="TRUE",Account=number,Amount=inv["amount_minor"],Narrative="ConveneCore invoice "+inv["id"],ExternalReference=inv["id"])
        return result.get("TransactionReference")
    def status(self,inv):
        fields={"PrivateTransactionReference":inv["id"],"DepositTransactionType":"PULL"}
        if inv.get("tracking_id"):fields["TransactionReference"]=inv["tracking_id"]
        result=self.call("actransactioncheckstatus",**fields)
        ref=result.get("TransactionReference")
        if not ref or (inv.get("tracking_id") and ref!=inv["tracking_id"]):raise ValueError("Gateway reference mismatch")
        currency=result.get("CurrencyCode")
        if currency in {"UGX-MTNMM","UGX-WARIDMM","UGX-AIRTELMM","UGX-AIRMM","UGX-WTLMM"}:currency="UGX"
        return {"reference":ref,"success":result.get("Status")=="OK" and result.get("StatusCode")=="0" and result.get("TransactionStatus")=="SUCCEEDED","amount":result.get("Amount"),"currency":currency}

class Iotec:
    def __init__(self,c):self.c=c;self.token=None
    def authenticate(self):
        response=json.loads(request(IOTEC_TOKEN,urlencode({"client_id":self.c["client_id"],"client_secret":self.c["client_secret"],"grant_type":"client_credentials"}).encode(),{"Content-Type":"application/x-www-form-urlencoded"}))
        self.token=response.get("access_token")
        if not self.token:raise RuntimeError("Gateway authentication failed")
    def test(self):self.authenticate()
    def call(self,route,body=None):
        if not self.token:self.authenticate()
        return json.loads(request(IOTEC_API+route,json.dumps(body).encode() if body is not None else None,{"Authorization":"Bearer "+self.token,"Content-Type":"application/json","Accept":"application/json"}),parse_float=Decimal)
    def submit(self,inv,number):
        if not 500<=inv["amount_minor"]<=1000000000:raise ValueError("Invoice outside ioTec collection limits")
        result=self.call("/collections/collect",{"category":"MobileMoney","currency":"UGX","walletId":self.c["wallet_id"],"externalId":inv["id"],"payer":number,"amount":inv["amount_minor"],"payerNote":"ConveneCore subscription","payeeNote":inv["id"]})
        return result.get("id")
    def status(self,inv):
        result=self.call("/collections/status/"+quote(inv["tracking_id"],safe="") if inv.get("tracking_id") else "/collections/external-id/"+quote(inv["id"],safe=""))
        ref=result.get("id")
        if result.get("externalId")!=inv["id"] or result.get("walletId")!=self.c["wallet_id"] or result.get("category")!="MobileMoney" or not ref or (inv.get("tracking_id") and ref!=inv["tracking_id"]):raise ValueError("Gateway identity mismatch")
        return {"reference":ref,"success":result.get("status")=="Success","amount":result.get("amount"),"currency":result.get("currency")}

def gateway(root,provider,*,for_collection=False,account_id=None):
    c=load(root).get(provider)
    if provider not in PROVIDERS or not c:raise ValueError("Gateway not configured")
    if for_collection and not c["enabled"]:raise ValueError("Gateway disabled")
    if account_id and c["account_id"]!=account_id:raise ValueError("Merchant account changed; reconcile with original credentials")
    return (Yo(c) if provider=="yo" else Iotec(c)),c["account_id"]
