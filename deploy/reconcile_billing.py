#!/usr/bin/env python3
"""Operator-run sandbox reconciliation and pending policy publication. No real gateway calls."""
import argparse
from pathlib import Path
import tenantctl
import billing
import pesapal_sandbox

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--root",type=Path,default=tenantctl.DEFAULT_ROOT)
    p.add_argument("--sync-only",action="store_true")
    args=p.parse_args()
    failures=0
    with tenantctl.registry(args.root) as rows:
        gateway=None
        for row in rows.values():
            for inv in row.get("invoices",{}).values():
                try:
                    if inv["status"]=="paid_pending_sync":billing.sync(args.root,rows,row,inv)
                    elif not args.sync_only and inv["sandbox"] and inv["status"]=="checkout_pending":
                        gateway=gateway or pesapal_sandbox.Gateway()
                        billing.reconcile_sandbox(args.root,rows,row,inv,gateway)
                except Exception:
                    failures+=1
                    print("Reconciliation needs review:",inv["id"])
    if failures:raise SystemExit(1)
if __name__=="__main__":main()
