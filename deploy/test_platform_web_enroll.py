import os
import tempfile
import time
import unittest
import threading
from pathlib import Path
from http.client import HTTPConnection
from urllib.parse import urlencode
import re
import platform_admin as admin
import platform_web_enroll as enroll

class BrowserEnrollmentTest(unittest.TestCase):
    def test_https_enrollment_and_mfa(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            key="test-only-enrollment-key-1234567890123456"
            password="Test-only-operator-password-123"
            keyfile=root/enroll.KEY_NAME
            admin.tenantctl.private_write(keyfile,key)
            server=admin.Console(root,0,"https://admin.example.test")
            thread=threading.Thread(target=server.serve_forever,daemon=True)
            thread.start()
            def send(method,path,body=None,cookie=None,origin=None,host="admin.example.test"):
                conn=HTTPConnection("127.0.0.1",server.server_port,timeout=4)
                headers={"Host":host}
                if origin:headers["Origin"]=origin
                if cookie:headers["Cookie"]=cookie
                if body is not None:
                    body=urlencode(body)
                    headers["Content-Type"]="application/x-www-form-urlencoded"
                conn.request(method,path,body=body,headers=headers)
                res=conn.getresponse()
                out=(res.status,res.read().decode(),res.getheader("Set-Cookie"))
                conn.close()
                return out
            origin=server.origin
            try:
                status,body,_=send("GET","/")
                self.assertEqual(status,200)
                self.assertIn("Private enrollment key",body)
                self.assertNotIn(key,body)
                self.assertEqual(send("POST","/setup",{"key":key,"password":password,"confirm":password},origin="https://evil.test")[0],403)
                self.assertEqual(send("POST","/setup",{"key":"a"*32,"password":password,"confirm":password},origin=origin)[0],400)
                status,body,cookie=send("POST","/setup",{"key":key,"password":password,"confirm":password},origin=origin)
                self.assertEqual(status,200)
                self.assertIn("Secure",cookie)
                self.assertIn("HttpOnly",cookie)
                self.assertFalse(admin.platform_mfa.enrolled(root))
                csrf=re.search(r'name="csrf" value="([^"]+)"',body).group(1)
                challenge=server.enrollment
                self.assertEqual(send("GET","/")[0],200)
                otp=admin.platform_mfa.totp(challenge["secret"],int(time.time())//30)
                status,body,_=send("POST","/setup/confirm",{"csrf":csrf,"otp":otp},cookie=cookie.split(";")[0],origin=origin)
                self.assertEqual(status,200)
                self.assertIn("Administrator created",body)
                self.assertTrue(admin.platform_mfa.enrolled(root))
                self.assertFalse(keyfile.exists())
                self.assertEqual(send("POST","/setup",{"key":key,"password":password,"confirm":password},origin=origin)[0],403)
                self.assertEqual(send("POST","/login",{"password":password,"otp":otp},origin=origin)[0],401)
                fresh=admin.platform_mfa.totp(challenge["secret"],int(time.time())//30+1)
                status,_,cookie=send("POST","/login",{"password":password,"otp":fresh},origin=origin)
                self.assertEqual(status,303)
                self.assertTrue(cookie.startswith("__Host-minuteseal-platform="))
                self.assertIn("Secure",cookie)
                self.assertIn("SameSite=Strict",cookie)
                self.assertIn("Organization management",send("GET","/",cookie=cookie.split(";")[0])[1])
                self.assertEqual(send("GET","/",host="evil.test")[0],421)
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=3)

    def test_key_expiration_and_permissions(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            path=root/enroll.KEY_NAME
            admin.tenantctl.private_write(path,"a"*40)
            self.assertTrue(enroll.available(root))
            os.chmod(path,0o644)
            self.assertFalse(enroll.available(root))
            os.chmod(path,0o600)
            os.utime(path,(time.time()-1900,time.time()-1900))
            self.assertFalse(enroll.available(root))
