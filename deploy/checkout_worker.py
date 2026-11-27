#!/usr/bin/env python3
"""Private scheduled worker: authorize queued intent against registry, then verify provider."""
import argparse
import time
from pathlib import Path
import billing
import checkout
import tenantctl

def run(root,path,*,sync_only=False):
    errors=0
    with tenantctl.registry(root) as rows:
        indexed={inv["id"]:(row,inv) for row in rows.values() for inv in row.get("invoices",{}).values()}
        if not sync_only:
            for item in checkout.queued(path):
                pair=indexed.get(item["invoice"])
                if not pair:
                    checkout.reject(path,item["key"]);continue
                row,inv=pair
                try:
                    if inv["status"]!="open":
                        checkout.publish(path,inv);continue
                    provider,phone=checkout.validate_intent(inv,item)
                    billing.begin_collection(root,rows,row,inv,provider,phone,True)
                    checkout.publish(path,inv)
                except Exception:
                    errors+=1
                    if inv["status"]=="open":checkout.reject(path,item["key"])
                    else:checkout.publish(path,inv)
        for row,inv in indexed.values():
            try:
                if inv["status"]=="paid_pending_sync":
                    billing.sync(root,rows,row,inv)
                elif not sync_only and inv["status"] in {"collection_pending","collection_unknown"}:
                    now=int(time.time())
                    if inv.get("next_verify_at",0)<=now:
                        # Back off repeated status calls; no collection retries.
                        inv["verify_attempts"]=inv.get("verify_attempts",0)+1
                        inv["next_verify_at"]=now+min(900,30*2**min(inv["verify_attempts"]-1,5))
                        billing.persist(root,rows)
                        billing.reconcile(root,rows,row,inv)
                checkout.publish(path,inv)
            except Exception:
                errors+=1
                print("Payment needs review:",inv["id"])
    return errors

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--root",type=Path,default=tenantctl.DEFAULT_ROOT)
    p.add_argument("--inbox",type=Path,required=True)
    p.add_argument("--sync-only",action="store_true")
    args=p.parse_args()
    if run(args.root,args.inbox,sync_only=args.sync_only):raise SystemExit(1)
if __name__=="__main__":main()
