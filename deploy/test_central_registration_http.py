import http.client, os, tempfile, threading, unittest
from pathlib import Path
from unittest.mock import patch
from urllib.parse import urlencode
import public_registration as reg
import onboarding
import central_registration_client

class CentralRegistrationHTTPTests(unittest.TestCase):
    def test_redirect_only_on_broker_success(self):
        with tempfile.TemporaryDirectory() as tmp:
            inbox=Path(tmp)/"inbox.db"
            data=dict(name="Example Group",contact="Test Admin",email="admin@example.invalid",sector="Corporate",password="Test-Only-Password!",confirm_password="Test-Only-Password!")
            ref,key,_=onboarding.register_browser(inbox,data,lambda *a:None)
            with patch.object(reg,"BASE","/register"),patch.dict(os.environ,{"CC_ONBOARD_REGISTRATION_PAUSED":"0","MS_CENTRAL_REGISTRATION_SOCKET":"/tmp/mock.sock"}):
                server=reg.Server(inbox,0,"https://minuteseal.example")
                thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
                try:
                    def post(origin="https://minuteseal.example"):
                        conn=http.client.HTTPConnection("127.0.0.1",server.server_port,timeout=5)
                        conn.request("POST","/register/verify",urlencode({"code":"123456"}),{"Host":"minuteseal.example","Origin":origin,"Content-Type":"application/x-www-form-urlencoded","Cookie":"__Host-ms-registration="+ref+"."+key})
                        response=conn.getresponse();result=(response.status,response.getheader("Location"),response.getheader("Set-Cookie"));response.read();conn.close();return result
                    with patch.object(central_registration_client,"complete",return_value=None) as broker:
                        assert post()[0]==400
                        assert post("https://other.example")[0]==403
                        assert broker.call_count==1
                    with patch.object(central_registration_client,"complete",side_effect=RuntimeError):
                        assert post()[0]==503
                    with patch.object(central_registration_client,"complete",return_value="x"*43):
                        status,location,cookie=post()
                        assert status==303 and location=="/dashboard"
                        assert "__Host-minuteseal-session=" in cookie and "HttpOnly" in cookie and "Secure" in cookie
                        assert "Domain=" not in cookie
                finally:server.shutdown();server.server_close();thread.join()
