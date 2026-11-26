import re
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import onboarding
import operator_onboarding
import platform_admin as admin

class OnboardingTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        self.path=self.root/"inbox.db"
        self.registry=self.root/"tenants"
        self.registry.mkdir(mode=0o700)
        self.origin="https://register.example.com"
        self.messages=[]
        self.data={"name":"Example Hospital","contact":"Example Administrator","email":"admin@example.com","slug":"alpha","sector":"Healthcare","plan":"professional"}

    def mail(self,*args):
        self.messages.append(args)

    def register(self):
        ref,key,sent=onboarding.register(self.path,self.data,self.origin,self.mail)
        self.assertTrue(sent)
        code=re.search(r"Verification code: ([A-Za-z0-9_-]+)",self.messages[-1][2]).group(1)
        return ref,key,code

    def test_verify_status_and_replay(self):
        ref,key,code=self.register()
        self.assertEqual(onboarding.inbox(self.path),[])
        self.assertIsNone(onboarding.get_status(self.path,ref,"x"*43))
        self.assertFalse(onboarding.verify(self.path,ref,"x"*43))
        self.assertEqual(onboarding.get_status(self.path,ref,key)["status"],"unverified")
        self.assertTrue(onboarding.verify(self.path,ref,code))
        self.assertFalse(onboarding.verify(self.path,ref,code))
        self.assertEqual(onboarding.inbox(self.path)[0]["status"],"verified")
        with onboarding.database(self.path) as db:
            row=db.execute("SELECT * FROM applications").fetchone()
            self.assertIsNone(row["verify_hash"])
            self.assertNotEqual(row["status_hash"],key)

    def test_expiration_and_resend(self):
        ref,key,code=self.register()
        self.assertFalse(onboarding.resend(self.path,ref,key,self.origin,self.mail))
        with onboarding.database(self.path) as db:
            db.execute("UPDATE applications SET expires=0,last_sent=0 WHERE ref=?",(ref,))
        self.assertFalse(onboarding.verify(self.path,ref,code))
        self.assertFalse(onboarding.resend(self.path,ref,"x"*43,self.origin,self.mail))
        self.assertTrue(onboarding.resend(self.path,ref,key,self.origin,self.mail))
        new=re.search(r"Verification code: ([A-Za-z0-9_-]+)",self.messages[-1][2]).group(1)
        self.assertFalse(onboarding.verify(self.path,ref,code))
        self.assertTrue(onboarding.verify(self.path,ref,new))

    def test_approval_only_after_verification_and_setup(self):
        ref,key,code=self.register()
        rows={}
        args=(self.path,self.registry,rows,ref,"alpha.example.com",19321,admin.defaults,admin.PLANS,admin.FEATURES)
        with patch("tenantctl.socket.socket"):
            with self.assertRaises(ValueError):
                operator_onboarding.approve(*args)
            self.assertTrue(onboarding.verify(self.path,ref,code))
            row=operator_onboarding.approve(*args)
        self.assertEqual(row["profile"]["plan"],"professional")
        self.assertFalse(row["enabled"])
        self.assertEqual(onboarding.get_status(self.path,ref,key)["status"],"provisioned")
        with self.assertRaises(ValueError):
            operator_onboarding.send_setup(self.path,self.registry,row,lambda *a,**k:None,self.mail)
        row["enabled"]=True
        with patch("operator_onboarding.onboarding.mail") as unused:
            with patch("operator_onboarding.secrets.token_urlsafe",return_value="A"*43):
                calls=[]
                def compose(*a,**k):calls.append((a,k))
                operator_onboarding.send_setup(self.path,self.registry,row,compose,self.mail)
        self.assertIn(onboarding.digest("A"*43),calls[0][0][2])
        self.assertNotIn("A"*43,calls[0][0][2])
        self.assertEqual(onboarding.get_status(self.path,ref,key),{"status":"setup_sent","host":"alpha.example.com"})
        self.assertIn("https://alpha.example.com/setup",self.messages[-1][2])

    def test_invalid_fields_and_mail_failure(self):
        with self.assertRaises(ValueError):
            onboarding.register(self.path,{**self.data,"slug":"../alpha"},self.origin,self.mail)
        def broken(*args):raise RuntimeError("secret provider error")
        ref,key,sent=onboarding.register(self.path,self.data,self.origin,broken)
        self.assertFalse(sent)
        self.assertEqual(onboarding.get_status(self.path,ref,key)["status"],"unverified")

    def test_mail_rate_limit(self):
        for _ in range(5):self.register()
        with self.assertRaises(ValueError):self.register()

    def test_reject_only_verified(self):
        ref,key,code=self.register()
        with self.assertRaises(ValueError):
            onboarding.transition(self.path,ref,"verified","rejected")
        onboarding.verify(self.path,ref,code)
        onboarding.transition(self.path,ref,"verified","rejected")
        self.assertEqual(onboarding.get_status(self.path,ref,key)["status"],"rejected")
        self.assertFalse(onboarding.verify(self.path,ref,code))

if __name__=="__main__":unittest.main()
