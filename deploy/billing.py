"""Operator-only invoices, verified collections and renewals."""
import calendar
import json
import re
import secrets
from datetime import date, datetime, timezone, timedelta
from decimal import Decimal, InvalidOperation
from pathlib import Path
import tenantctl

CURRENCIES={"UGX":0,"USD":2,"EUR":2,"GBP":2,"KES":2}
METHODS={"bank","mobile_money","cash","other"}
REFERENCE=re.compile(r"[A-Za-z0-9._/-]{3,100}")

def today():return datetime.now(timezone.utc).date()
def timestamp():return datetime.now(timezone.utc).isoformat(timespec="seconds")

def minor(amount,currency):
    if currency not in CURRENCIES:raise ValueError("Unsupported currency")
    try:
        value=Decimal(str(amount))
        scaled=value*10**CURRENCIES[currency]
        if not value.is_finite() or scaled!=scaled.to_integral_value() or not 0<scaled<=10**12:raise ValueError("Invalid amount")
        return int(scaled)
    except (InvalidOperation,OverflowError) as exc:raise ValueError("Invalid amount") from exc

def display(amount,currency):
    return f"{Decimal(amount)/10**CURRENCIES[currency]:,.{CURRENCIES[currency]}f} {currency}"

def create_invoice(row,amount,currency,months,*,sandbox=False):
    if type(months)!=int or not 1<=months<=36:raise ValueError("Choose 1–36 subscription months")
    if type(sandbox)!=bool:raise ValueError("Invalid invoice mode")
    invoices=row.setdefault("invoices",{})
    # Keep only one unsettled invoice for a workspace to avoid accidental overlapping orders.
    if any(i["status"] in {"open","checkout_pending","collection_pending","collection_unknown","paid_pending_sync"} for i in invoices.values()):
        raise ValueError("Resolve the existing open invoice first")
    inv={"id":"CC-"+today().strftime("%Y%m%d")+"-"+secrets.token_hex(8).upper(),
         "tenant":row["slug"],"customer":row.get("profile",{}).get("name",row["slug"]),
         "amount_minor":minor(amount,currency),"currency":currency,"months":months,
         "plan":row.get("profile",{}).get("plan","starter"),"created_at":timestamp(),
         "status":"open","sandbox":sandbox,"tracking_id":None,"checkout_url":None}
    invoices[inv["id"]]=inv
    return inv

def invoice(row,invoice_id):
    inv=row.get("invoices",{}).get(invoice_id)
    if not inv or inv["tenant"]!=row["slug"]:raise ValueError("Invoice not found")
    return inv

def find_payment(rows,channel,reference):
    for row in rows.values():
        for inv in row.get("invoices",{}).values():
            if inv.get("payment",{}).get("channel")==channel and inv["payment"]["reference"]==reference:return inv
    return None

def add_months(start,months):
    offset=start.month-1+months
    year=start.year+offset//12; month=offset%12+1
    return date(year,month,min(start.day,calendar.monthrange(year,month)[1]))

def persist(root,rows):
    tenantctl.private_write(Path(root)/"registry.json",json.dumps(rows,indent=2)+"\n")

def begin_collection(root,rows,row,inv,provider,number,confirmed):
    import payment_gateways as pg
    if inv["sandbox"] or inv["status"]!="open" or inv["currency"]!="UGX" or confirmed is not True:raise ValueError("Open UGX invoice and payer consent required")
    number=pg.phone(number)
    if provider=="iotec" and not 500<=inv["amount_minor"]<=1000000000:raise ValueError("Amount outside ioTec collection limits")
    g,account=pg.gateway(root,provider,for_collection=True)
    # Persist before network call, so a timeout cannot permit a second collection.
    inv.update(provider=provider,merchant_account=account,status="collection_unknown",tracking_id=None,payer_last4=number[-4:])
    persist(root,rows)
    try:
        ref=g.submit(inv,number)
        if isinstance(ref,str) and re.fullmatch(r"[A-Za-z0-9._/-]{3,250}",ref):
            inv.update(tracking_id=ref,status="collection_pending")
            persist(root,rows)
    except Exception:
        pass
    return inv

def _record(rows,root,row,inv,channel,reference,amount,currency,sandbox):
    if inv["sandbox"]!=sandbox or inv["amount_minor"]!=minor(amount,currency) or inv["currency"]!=currency:
        raise ValueError("Payment does not match the invoice")
    if not re.fullmatch(r"[A-Za-z0-9._/-]{3,250}",reference):raise ValueError("Invalid payment reference")
    existing=find_payment(rows,channel,reference)
    if existing and existing["id"]!=inv["id"]:raise ValueError("Payment already assigned")
    if inv["status"]=="paid":
        if inv.get("payment",{}).get("reference")==reference and inv["payment"]["channel"]==channel:return inv
        raise ValueError("Invoice already settled")
    if inv["status"] not in {"open","collection_pending","collection_unknown"}:raise ValueError("Invoice not payable")
    if not sandbox and row.get("profile",{}).get("plan","starter")!=inv["plan"]:raise ValueError("Plan changed; reconcile invoice before renewal")
    if not sandbox and row.get("profile",{}).get("expiry"):date.fromisoformat(row["profile"]["expiry"])
    inv["payment"]={"channel":channel,"reference":reference,"amount_minor":inv["amount_minor"],"currency":currency,"recorded_at":timestamp(),"sandbox":sandbox}
    inv["receipt_id"]="CCR-"+secrets.token_hex(10).upper()
    if sandbox:
        inv["status"]="paid"
        inv["renewal"]="sandbox_only"
        persist(root,rows)
        return inv
    profile=row.setdefault("profile",{})
    previous=date.fromisoformat(profile["expiry"]) if profile.get("expiry") else None
    # Expiry is inclusive: renew from the next unexpired day, or today.
    start=max(today(),previous+timedelta(days=1)) if previous else today()
    expiry=(add_months(start,inv["months"])-timedelta(days=1)).isoformat()
    inv["renewal"]={"previous_expiry":profile.get("expiry",""),"start":start.isoformat(),"new_expiry":expiry}
    inv["status"]="paid_pending_sync"
    profile["expiry"]=expiry
    persist(root,rows) # durable payment and target expiry before publishing policy
    return sync(root,rows,row,inv)

def sync(root,rows,row,inv):
    if inv["status"]=="paid":return inv
    if inv["status"]!="paid_pending_sync":raise ValueError("No pending renewal")
    import entitlements
    if row["profile"]["expiry"]!=inv["renewal"]["new_expiry"]:raise ValueError("Expiry changed; manual reconciliation required")
    entitlements.publish(root,row)
    inv["status"]="paid"
    persist(root,rows)
    return inv

def reconcile(root,rows,row,inv):
    import payment_gateways as pg
    if inv["status"]=="paid":return inv
    if inv["status"]=="paid_pending_sync":return sync(root,rows,row,inv)
    if inv["sandbox"] or inv["status"] not in {"collection_pending","collection_unknown"}:raise ValueError("No production collection to verify")
    g,_=pg.gateway(root,inv["provider"],account_id=inv["merchant_account"])
    result=g.status(inv)
    if not result["success"]:return inv
    return _record(rows,root,row,inv,inv["provider"],result["reference"],result["amount"],result["currency"],False)

def record_manual(root,rows,row,inv,method,reference,amount,currency,confirmed):
    if inv["status"] not in {"open","paid"} or inv["sandbox"] or method not in METHODS or confirmed is not True:raise ValueError("Independently confirmed manual settlement required")
    return _record(rows,root,row,inv,"manual:"+method,reference,amount,currency,False)

def cancel(inv):
    if inv["status"]!="open" or inv.get("tracking_id"):raise ValueError("Only unsubmitted open invoices may be cancelled")
    inv["status"]="cancelled"
