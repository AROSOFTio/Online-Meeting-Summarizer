#!/usr/bin/env python3
"""Verify existing collections directly with their provider; never initiate a payment."""
import argparse
from pathlib import Path
import tenantctl
import billing

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--root",type=Path,default=tenantctl.DEFAULT_ROOT)
    p.add_argument("--sync-only",action="store_true")
    args=p.parse_args()
    failures=0
    with tenantctl.registry(args.root) as rows:
        for row in rows.values():
            for inv in row.get("invoices",{}).values():
                try:
                    if inv["status"]=="paid_pending_sync":billing.sync(args.root,rows,row,inv)
                    elif not args.sync_only and inv["status"] in {"collection_pending","collection_unknown"}:
                        billing.reconcile(args.root,rows,row,inv)
                except Exception:
                    failures+=1
                    print("Reconciliation needs review:",inv["id"])
    if failures:raise SystemExit(1)
if __name__=="__main__":main()
