import tempfile
import threading
from http.client import HTTPConnection
from urllib.parse import urlencode
import re
import unittest
from pathlib import Path
from unittest.mock import patch
import platform_admin as admin


def form(**kwargs):
    base={"name":"Example Hospital","sector":"Healthcare","plan":"professional","expiry":"2030-01-01",
          "users":"50","storage_gib":"100","ai_minutes":"3000"}
    base.update(kwargs)
    return {k:v if isinstance(v,list) else [v] for k,v in base.items()}


class PlatformAdminTests(unittest.TestCase):
    def test_password_hash(self):
        password="Long-operator-password-example"
        r=admin.password_record(password)
        self.assertNotIn(password,str(r))
        self.assertTrue(admin.check_password(password,r))
        self.assertFalse(admin.check_password("different password",r))
        self.assertNotEqual(r,admin.password_record(password))

    def test_config_validation(self):
        p=admin.clean_profile(form(features=["templates","exports"]))
        self.assertEqual(p["limits"]["users"],50)
        self.assertEqual(p["features"],["templates","exports"])
        with self.assertRaises(ValueError):
            admin.clean_profile(form(users="-5"))
        with self.assertRaises(ValueError):
            admin.clean_profile(form(features=["unknown"]))
        with self.assertRaises(ValueError):
            admin.clean_profile(form(expiry="not-a-date"))

    def test_workspaces_and_actions(self):
        with tempfile.TemporaryDirectory() as d, patch("tenantctl.socket.socket"):
            root=Path(d)
            rows={}
            admin.dispatch(root,rows,form(action="provision",slug="alpha",host="alpha.example.com",email="admin@example.com",port="19221"))
            admin.dispatch(root,rows,form(action="provision",slug="bravo",host="bravo.example.com",email="admin@example.com",port="19222"))
            self.assertEqual(set(rows),{"alpha","bravo"})
            with patch("platform_admin.safe_compose",return_value="") as compose:
                admin.dispatch(root,rows,form(action="activate",slug="alpha"))
                self.assertTrue(rows["alpha"]["enabled"])
                self.assertFalse(rows["bravo"]["enabled"])
                compose.assert_called_once_with(root,rows["alpha"],["up","-d","--build","--wait"])
            with patch("platform_admin.collect_usage",return_value={"active_users":3,"meetings":4,"recorded_seconds":5,"storage_bytes":100,"jobs_this_month":2,"collected_at":"2026-11-26"}) :
                admin.dispatch(root,rows,form(action="refresh",slug="alpha"))
            self.assertEqual(rows["alpha"]["profile"]["usage"]["meetings"],4)
            self.assertIsNone(rows["bravo"]["profile"]["usage"])
            with patch("platform_admin.safe_compose",side_effect=RuntimeError("private credential")):
                msg=admin.dispatch(root,rows,form(action="suspend",slug="alpha"))
                self.assertNotIn("private credential",msg)
                self.assertEqual(rows["alpha"]["profile"]["lifecycle"],"unknown — reconcile")
            self.assertEqual(admin.audit_tail(root)[0]["outcome"],"failed")
            self.assertNotIn("private credential",(root/"platform-audit.jsonl").read_text())

    def test_html_escapes_user_values(self):
        row={"slug":"alpha","host":"alpha.example.com","port":19221,"admin_email":"admin@example.com","enabled":False}
        row["profile"]={**admin.defaults(row),"name":"<script>alert(1)</script>"}
        page=admin.dashboard({"alpha":row},[],"test-csrf")
        self.assertNotIn("<script>alert",page)
        self.assertIn("&lt;script&gt;",page)
        self.assertIn("configuration only",page)
        self.assertNotIn("DB_PASSWORD",page)


    def test_http_login_csrf_and_logout(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            password="Test-only-long-platform-password"
            server=admin.Console(root,0,admin.password_record(password))
            thread=threading.Thread(target=server.serve_forever,daemon=True)
            thread.start()
            def send(method,path,body=None,cookie=None,origin=None,host=None):
                conn=HTTPConnection("127.0.0.1",server.server_port,timeout=4)
                headers={}
                if cookie:headers["Cookie"]=cookie
                if origin:headers["Origin"]=origin
                if host:headers["Host"]=host
                if body is not None:
                    body=urlencode(body)
                    headers["Content-Type"]="application/x-www-form-urlencoded"
                conn.request(method,path,body=body,headers=headers)
                res=conn.getresponse()
                result=(res.status,res.read().decode(),res.getheader("Set-Cookie"))
                conn.close()
                return result
            try:
                status,body,_=send("GET","/")
                self.assertEqual(status,200)
                self.assertIn("Platform password",body)
                self.assertNotIn("Organization management",body)
                self.assertEqual(send("GET","/",host="unknown.example")[0],421)
                self.assertEqual(send("POST","/login",{"password":password},origin="https://customer.example")[0],403)
                self.assertEqual(send("POST","/login",{"password":"wrong"},origin=server.origin)[0],401)
                status,_,cookie=send("POST","/login",{"password":password},origin=server.origin)
                self.assertEqual(status,303)
                self.assertIn("HttpOnly",cookie)
                self.assertIn("SameSite=Strict",cookie)
                cookie=cookie.split(";")[0]
                status,body,_=send("GET","/",cookie=cookie)
                self.assertEqual(status,200)
                self.assertIn("Organization management",body)
                csrf=re.search(r'name="csrf" value="([^"]+)"',body).group(1)
                self.assertEqual(send("POST","/action",{"action":"logout","csrf":"invalid"},cookie,server.origin)[0],403)
                self.assertEqual(send("POST","/action",{"action":"logout","csrf":csrf},cookie,"https://customer.example")[0],403)
                self.assertEqual(send("POST","/action",{"action":"logout","csrf":csrf},cookie,server.origin)[0],200)
                self.assertIn("Platform password",send("GET","/",cookie=cookie)[1])
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=3)


if __name__=="__main__":
    unittest.main()
