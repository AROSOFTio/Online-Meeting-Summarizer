import base64,hashlib,hmac,os,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from app.core.turn_relay import meeting_ice_servers,TTL_SECONDS

class TestTurnRelay(unittest.TestCase):
    def test_no_secret_returns_stun_only(self):
        with patch.dict(os.environ,{"MEETING_TURN_SECRET_FILE":""}):
            result=meeting_ice_servers("a"*32,100)
            self.assertEqual(len(result["ice_servers"]),1)
            self.assertEqual(result["ice_expires_at"],0)
    def test_signed_expiring_credentials(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/"secret"
            secret="ab"*32;p.write_text(secret)
            with patch.dict(os.environ,{"MEETING_TURN_SECRET_FILE":str(p)}):
                result=meeting_ice_servers("a"*32,100)
                t=result["ice_servers"][1]
                self.assertEqual(result["ice_expires_at"],100+TTL_SECONDS)
                self.assertEqual(t["username"],f"{100+TTL_SECONDS}:"+"a"*32)
                self.assertEqual(t["credential"],base64.b64encode(hmac.new(secret.encode(),t["username"].encode(),hashlib.sha1).digest()).decode())
                self.assertEqual(len(t["urls"]),3)
                self.assertNotIn(secret,str(result))
                with self.assertRaises(ValueError):meeting_ice_servers("bad-peer",100)
