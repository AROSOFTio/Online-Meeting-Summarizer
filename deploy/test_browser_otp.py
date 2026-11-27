import tempfile
import unittest
import re
from pathlib import Path
import onboarding

class BrowserOTPTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.path=Path(self.tmp.name)/"inbox.db"
        self.messages=[]
        self.data=dict(name="Example Group",contact="Test Admin",email="admin@example.invalid",slug="example",sector="Corporate",plan="starter",password="Test-Only-Password!",confirm_password="Test-Only-Password!")
    def mail(self,*args):self.messages.append(args)
    def code(self):return re.search(r"code is ([0-9]{6})",self.messages[-1][2]).group(1)
    def test_verify_and_replay(self):
        ref,key,sent=onboarding.register_browser(self.path,self.data,self.mail)
        self.assertTrue(sent);code=self.code()
        self.assertNotIn(ref,self.messages[-1][2]);self.assertNotIn(key,self.messages[-1][2])
        self.assertIsNone(onboarding.browser_state(self.path,ref,"x"*43))
        self.assertFalse(onboarding.verify_browser(self.path,ref,"x"*43,code))
        self.assertTrue(onboarding.verify_browser(self.path,ref,key,code))
        self.assertFalse(onboarding.verify_browser(self.path,ref,key,code))
        self.assertEqual(onboarding.browser_state(self.path,ref,key)["status"],"verified")
    def test_limits_resend_expiry(self):
        ref,key,_=onboarding.register_browser(self.path,self.data,self.mail)
        code=self.code();wrong="111111" if code!="111111" else "222222"
        for _ in range(5):self.assertFalse(onboarding.verify_browser(self.path,ref,key,wrong))
        self.assertFalse(onboarding.verify_browser(self.path,ref,key,code))
        self.assertFalse(onboarding.resend_browser(self.path,ref,key,self.mail))
        with onboarding.database(self.path) as db:db.execute("UPDATE applications SET last_sent=0,expires=0 WHERE ref=?",(ref,))
        self.assertTrue(onboarding.resend_browser(self.path,ref,key,self.mail))
        self.assertTrue(onboarding.verify_browser(self.path,ref,key,self.code()))
    def test_expired(self):
        ref,key,_=onboarding.register_browser(self.path,self.data,self.mail)
        with onboarding.database(self.path) as db:db.execute("UPDATE applications SET expires=0 WHERE ref=?",(ref,))
        self.assertFalse(onboarding.verify_browser(self.path,ref,key,self.code()))

    def test_password_required_and_hash_only(self):
        from argon2 import PasswordHasher
        with self.assertRaises(ValueError):
            onboarding.register_browser(self.path,{**self.data,"password":""},self.mail)
        with self.assertRaises(ValueError):
            onboarding.register_browser(self.path,{**self.data,"confirm_password":"different"},self.mail)
        ref,key,_=onboarding.register_browser(self.path,self.data,self.mail)
        self.assertIsNone(onboarding.pending_password(self.path,ref))
        self.assertTrue(onboarding.verify_browser(self.path,ref,key,self.code()))
        hashed=onboarding.pending_password(self.path,ref)
        self.assertTrue(PasswordHasher().verify(hashed,self.data["password"]))
        self.assertNotIn(self.data["password"],self.path.read_bytes().decode("latin1"))
        onboarding.transition(self.path,ref,"verified","provisioned","example.example.invalid")
        onboarding.finish_registration(self.path,ref,"example.example.invalid")
        self.assertIsNone(onboarding.pending_password(self.path,ref))
        self.assertEqual(onboarding.browser_state(self.path,ref,key)["status"],"activated")
