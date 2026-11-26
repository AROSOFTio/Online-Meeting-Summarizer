import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from datetime import date
import billing
import payment_gateways as pg
import platform_admin as admin
import tenantctl

class BillingTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        self.rows={}
        with patch("tenantctl.socket.socket"):
            for slug,port in [("alpha",19081),("bravo",19082)]:
                row=tenantctl.provision(self.root,self.rows,slug,slug+".example.com","admin@example.com",port)
                row["profile"]=admin.defaults(row)
        self.row=self.rows["alpha"]
        self.row["profile"]["expiry"]="2030-01-31"
        pg.configure(self.root,"yo",{"username":"fake-user","password":"fake-secret"},True,True)
    def test_write_only_gateway_config(self):
        data=pg.public_config(self.root)
        self.assertTrue(data["yo"]["default"])
        self.assertNotIn("fake-secret",str(data))
        self.assertEqual(pg.path(self.root).stat().st_mode&0o777,0o600)
        html=admin.dashboard(self.rows,[],"csrf",gateways=data)
        self.assertIn("Yo! Uganda",html)
        self.assertIn("ioTec Pay",html)
        self.assertNotIn("fake-secret",html)
        self.assertNotIn("fake-user",html)
        pg.configure(self.root,"yo",{"username":"","password":""},False)
        self.assertEqual(pg.load(self.root)["yo"]["password"],"fake-secret")
        with self.assertRaises(ValueError):pg.gateway(self.root,"yo",for_collection=True)
    def test_production_invoice_and_idempotent_renewal(self):
        inv=billing.create_invoice(self.row,"10000","UGX",1)
        with patch.object(pg.Yo,"submit",return_value="test-transaction") as submit:
            with self.assertRaises(ValueError):billing.begin_collection(self.root,self.rows,self.row,inv,"yo","0772123456",False)
            submit.assert_not_called()
            billing.begin_collection(self.root,self.rows,self.row,inv,"yo","0772123456",True)
            self.assertEqual(inv["status"],"collection_pending")
            self.assertNotIn("256772123456",json.dumps(inv))
            with self.assertRaises(ValueError):billing.begin_collection(self.root,self.rows,self.row,inv,"yo","0772123456",True)
            submit.assert_called_once()
        with patch.object(pg.Yo,"status",return_value={"reference":"test-transaction","success":True,"amount":"9999","currency":"UGX"}):
            with self.assertRaises(ValueError):billing.reconcile(self.root,self.rows,self.row,inv)
        self.assertEqual(self.row["profile"]["expiry"],"2030-01-31")
        with patch.object(pg.Yo,"status",return_value={"reference":"test-transaction","success":True,"amount":"10000","currency":"UGX"}):
            billing.reconcile(self.root,self.rows,self.row,inv)
            self.assertEqual(inv["status"],"paid")
            self.assertEqual(self.row["profile"]["expiry"],"2030-02-28")
            receipt=inv["receipt_id"]
            billing.reconcile(self.root,self.rows,self.row,inv)
            self.assertEqual(inv["receipt_id"],receipt)
            self.assertEqual(self.row["profile"]["expiry"],"2030-02-28")
        self.assertEqual(self.rows["bravo"]["profile"]["expiry"],"")
        self.assertIn("PAYMENT RECEIPT",admin.billing_document(self.row,inv,True))
    def test_timeout_does_not_resubmit(self):
        inv=billing.create_invoice(self.row,10000,"UGX",1)
        with patch.object(pg.Yo,"submit",side_effect=TimeoutError()):
            billing.begin_collection(self.root,self.rows,self.row,inv,"yo","0772123456",True)
        self.assertEqual(inv["status"],"collection_unknown")
        self.assertEqual(json.loads((self.root/"registry.json").read_text())["alpha"]["invoices"][inv["id"]]["status"],"collection_unknown")
        with self.assertRaises(ValueError):billing.cancel(inv)
        with self.assertRaises(ValueError):billing.create_invoice(self.row,10000,"UGX",1)
        with self.assertRaises(ValueError):billing.record_manual(self.root,self.rows,self.row,inv,"bank","abc123",10000,"UGX",True)
    def test_iotec_response_identity(self):
        wallet="00000000-0000-4000-8000-000000000001"
        pg.configure(self.root,"iotec",{"client_id":"test-id","client_secret":"test-secret","wallet_id":wallet},True)
        inv=billing.create_invoice(self.row,10000,"UGX",1)
        g,_=pg.gateway(self.root,"iotec")
        result={"id":"example-reference","externalId":inv["id"],"walletId":wallet,"category":"MobileMoney","status":"Success","amount":10000,"currency":"UGX"}
        with patch.object(g,"call",return_value=result):
            self.assertTrue(g.status(inv)["success"])
        with patch.object(g,"call",return_value={**result,"walletId":"wrong"}):
            with self.assertRaises(ValueError):g.status(inv)
        with patch.object(g,"call",return_value={**result,"externalId":"wrong"}):
            with self.assertRaises(ValueError):g.status(inv)
    def test_manual_reference_and_document(self):
        inv=billing.create_invoice(self.row,"12.34","USD",1)
        with self.assertRaises(ValueError):billing.record_manual(self.root,self.rows,self.row,inv,"bank","bank-123",12.34,"USD",False)
        billing.record_manual(self.root,self.rows,self.row,inv,"bank","bank-123",12.34,"USD",True)
        other=self.rows["bravo"]
        second=billing.create_invoice(other,"12.34","USD",1)
        with self.assertRaises(ValueError):billing.record_manual(self.root,self.rows,other,second,"bank","bank-123",12.34,"USD",True)
        with self.assertRaises(ValueError):admin.billing_document(other,second,True)
    def test_pending_publish_retry(self):
        inv=billing.create_invoice(self.row,10000,"UGX",1)
        with patch("entitlements.publish",side_effect=OSError("fixture")):
            with self.assertRaises(OSError):billing.record_manual(self.root,self.rows,self.row,inv,"bank","bank-456",10000,"UGX",True)
        self.assertEqual(inv["status"],"paid_pending_sync")
        expiry=self.row["profile"]["expiry"]
        billing.sync(self.root,self.rows,self.row,inv)
        billing.sync(self.root,self.rows,self.row,inv)
        self.assertEqual(self.row["profile"]["expiry"],expiry)

if __name__=="__main__":unittest.main()
