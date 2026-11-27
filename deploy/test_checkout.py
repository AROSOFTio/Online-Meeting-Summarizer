import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import billing
import checkout
import checkout_worker
import payment_gateways as pg
import platform_admin as admin
import public_checkout
import tenantctl

class CheckoutTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)/"private"
        self.root.mkdir(mode=0o700)
        self.path=Path(self.tmp.name)/"checkout.db"
        self.rows={}
        with patch("tenantctl.socket.socket"):
            for slug,port in [("alpha",19081),("bravo",19082)]:
                row=tenantctl.provision(self.root,self.rows,slug,slug+".example.com","admin@example.com",port)
                row["profile"]=admin.defaults(row)
        pg.configure(self.root,"yo",{"username":"fixture","password":"fixture-secret"},True)
        pg.configure(self.root,"iotec",{"client_id":"fixture","client_secret":"fixture-secret","wallet_id":"00000000-0000-4000-8000-000000000001"},True)
        self.row=self.rows["alpha"]
        self.row["profile"]["expiry"]="2030-01-31"
        self.inv=billing.create_invoice(self.row,10000,"UGX",1)
        self.token=checkout.issue(self.path,self.inv,["yo","iotec"])
        billing.persist(self.root,self.rows)
        checkout.publish(self.path,self.inv)

    def saved(self):
        rows=json.loads((self.root/"registry.json").read_text())
        return rows,rows["alpha"]["invoices"][self.inv["id"]]

    def test_private_link_and_no_credentials(self):
        self.assertIsNone(checkout.read(self.path,"x"*43))
        data=checkout.read(self.path,self.token)
        self.assertEqual(data["amount"],10000)
        self.assertEqual(data["providers"],["yo","iotec"])
        self.assertNotIn("fixture-secret",str(data))
        self.assertNotIn("admin@example.com",str(data))
        self.assertNotIn(self.token,(self.root/"registry.json").read_text())
        self.assertIn("Request payment",public_checkout.render(data,self.token))
        with self.assertRaises(ValueError):checkout.queue(self.path,self.token,"yo","0772123456",False)
        with self.assertRaises(ValueError):checkout.queue(self.path,self.token,"other","0772123456",True)

    def test_yo_checkout_and_automatic_renewal(self):
        checkout.queue(self.path,self.token,"yo","0772123456",True)
        with self.assertRaises(ValueError):checkout.queue(self.path,self.token,"iotec","0772123456",True)
        with patch.object(pg.Yo,"submit",return_value="fixture-yo-ref") as submit,patch.object(pg.Yo,"status",return_value={"reference":"fixture-yo-ref","success":True,"amount":"10000","currency":"UGX"}):
            self.assertEqual(checkout_worker.run(self.root,self.path),0)
            self.assertEqual(checkout_worker.run(self.root,self.path),0)
            submit.assert_called_once()
        rows,inv=self.saved()
        self.assertEqual(inv["status"],"paid")
        self.assertEqual(rows["alpha"]["profile"]["expiry"],"2030-02-28")
        self.assertEqual(rows["bravo"]["profile"]["expiry"],"")
        self.assertEqual(checkout.read(self.path,self.token)["receipt"],inv["receipt_id"])
        self.assertEqual(checkout.queued(self.path),[])
        with checkout.db(self.path) as c:self.assertIsNone(c.execute("SELECT intent FROM checkout").fetchone()[0])

    def test_iotec_checkout_pending_and_verified(self):
        checkout.queue(self.path,self.token,"iotec","0700123456",True)
        with patch.object(pg.Iotec,"submit",return_value="fixture-io-ref") as submit,patch.object(pg.Iotec,"status",return_value={"reference":"fixture-io-ref","success":False,"amount":10000,"currency":"UGX"}):
            self.assertEqual(checkout_worker.run(self.root,self.path),0)
            submit.assert_called_once()
        rows,inv=self.saved()
        self.assertEqual(inv["status"],"collection_pending")
        self.assertEqual(rows["alpha"]["profile"]["expiry"],"2030-01-31")
        inv["next_verify_at"]=0
        billing.persist(self.root,rows)
        with patch.object(pg.Iotec,"submit") as submit,patch.object(pg.Iotec,"status",return_value={"reference":"fixture-io-ref","success":True,"amount":10000,"currency":"UGX"}):
            self.assertEqual(checkout_worker.run(self.root,self.path),0)
            submit.assert_not_called()
        self.assertEqual(self.saved()[1]["status"],"paid")

    def test_altered_amount_rejected(self):
        checkout.queue(self.path,self.token,"yo","0772123456",True)
        with checkout.db(self.path) as c:
            intent=json.loads(c.execute("SELECT intent FROM checkout").fetchone()[0]);intent["amount"]=1
            c.execute("UPDATE checkout SET intent=?",(json.dumps(intent),))
        with patch.object(pg.Yo,"submit") as submit:
            self.assertEqual(checkout_worker.run(self.root,self.path),1)
            submit.assert_not_called()
        self.assertEqual(self.saved()[1]["status"],"open")
        self.assertEqual(checkout.read(self.path,self.token)["status"],"review_required")
        with self.assertRaises(ValueError):checkout.queue(self.path,self.token,"yo","0772123456",True)

    def test_timeout_and_mismatched_gateway_amount(self):
        checkout.queue(self.path,self.token,"yo","0772123456",True)
        with patch.object(pg.Yo,"submit",side_effect=TimeoutError()) as submit,patch.object(pg.Yo,"status",return_value={"reference":"fixture-yo-ref","success":True,"amount":9999,"currency":"UGX"}):
            self.assertEqual(checkout_worker.run(self.root,self.path),1)
            checkout_worker.run(self.root,self.path)
            submit.assert_called_once()
        rows,inv=self.saved()
        self.assertEqual(inv["status"],"collection_unknown")
        self.assertEqual(rows["alpha"]["profile"]["expiry"],"2030-01-31")

    def test_revocation_and_expiry(self):
        meta=self.inv["customer_checkout"]
        self.assertIsNone(checkout.read(self.path,self.token,now=meta["expires"]+1))
        with self.assertRaises(ValueError):checkout.queue(self.path,self.token,"yo","0772123456",True,now=meta["expires"]+1)
        checkout.revoke(self.path,self.inv)
        self.assertIsNone(checkout.read(self.path,self.token))
        self.assertNotIn("customer_checkout",self.inv)

if __name__=="__main__":unittest.main()
