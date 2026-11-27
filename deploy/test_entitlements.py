import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from datetime import date, datetime, timezone
from unittest.mock import patch
import tenantctl
import entitlements
import platform_admin as admin

spec=importlib.util.spec_from_file_location("subscription_policy",Path(__file__).resolve().parents[1]/"backend/app/core/subscription_policy.py")
rules=importlib.util.module_from_spec(spec)
spec.loader.exec_module(rules)

class EntitlementTests(unittest.TestCase):
    def test_expiry_grace_and_renewal(self):
        p={"expiry":"2026-11-30","grace_days":3}
        self.assertEqual(rules.state(p,date(2026,11,30)),"active")
        self.assertEqual(rules.state(p,date(2026,12,1)),"grace")
        self.assertEqual(rules.state(p,date(2026,12,3)),"grace")
        self.assertEqual(rules.state(p,date(2026,12,4)),"expired")
        p["expiry"]="2027-01-01"
        self.assertEqual(rules.state(p,date(2026,12,4)),"active")
        self.assertEqual(rules.monthly_key(datetime(2027,1,1,tzinfo=timezone.utc)),"__cc_ai_seconds_2027_01")
    def test_feature_routes_and_expiry(self):
        for path,method,required in [
            ("/api/live-rooms/1/join","POST",{"live"}),
            ("/api/meetings/1/start/","POST",{"live"}),
            ("/api/recordings/upload/1","POST",{"recording"}),
            ("/api/meetings/1/transcribe","POST",{"ai"}),
            ("/api/meetings/1/retry","POST",{"ai"}),
            ("/api/summaries/1/generate","POST",{"ai"}),
            ("/api/minute-formats/meeting/1/generate","POST",{"templates","ai"}),
            ("/api/meetings/1/export","GET",{"exports"}),
            ("/api/meetings/1/final-minutes/status","GET",{"exports"}),
            ("/api/meetings/1/finalize","POST",{"exports"}),
            ("/api/action-items/","POST",{"actions"}),
            ("/api/system/backups","POST",{"audit"}),
        ]:self.assertEqual(rules.route_features(path,method),required)
        self.assertFalse(rules.allowed_when_expired("/api/meetings/","POST"))
        self.assertTrue(rules.allowed_when_expired("/api/meetings/1","GET"))
        self.assertTrue(rules.allowed_when_expired("/api/staff/3","DELETE"))
        self.assertTrue(rules.allowed_when_expired("/api/meetings/1/end","POST"))
    def test_publish_per_tenant_and_update(self):
        with tempfile.TemporaryDirectory() as d,patch("tenantctl.socket.socket"):
            root=Path(d); rows={}
            a=tenantctl.provision(root,rows,"alpha","alpha.example.com","admin@example.com",19221)
            b=tenantctl.provision(root,rows,"bravo","bravo.example.com","admin@example.com",19222)
            pa=root/"alpha/entitlements/subscription.json"; pb=root/"bravo/entitlements/subscription.json"
            self.assertEqual(rules.load(pa,"alpha")["limits"]["users"],10)
            original=pb.read_bytes()
            profile={**admin.defaults(a),"plan":"custom","limits":{"users":2,"storage_gib":1,"ai_minutes":5},"expiry":"2030-01-01","grace_days":4,"features":["exports"]}
            entitlements.publish(root,a,profile)
            self.assertEqual(rules.load(pa,"alpha")["limits"]["users"],2)
            self.assertEqual(rules.load(pa,"alpha")["features"],["exports"])
            self.assertEqual(pb.read_bytes(),original)
            with self.assertRaises(ValueError):rules.load(pa,"bravo")
            self.assertIn("TENANT_POLICY_DIR=",(root/"alpha/tenant.env").read_text())
            self.assertEqual(pa.stat().st_mode&0o777,0o600)
    def test_invalid_policy(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/"policy.json"
            p={"tenant":"alpha",**entitlements.DEFAULT,"grace_days":31}
            path.write_text(json.dumps(p))
            with self.assertRaises(ValueError):rules.load(path,"alpha")
            p["grace_days"]=0;p["limits"]={**p["limits"],"users":0}
            path.write_text(json.dumps(p))
            with self.assertRaises(ValueError):rules.load(path,"alpha")
