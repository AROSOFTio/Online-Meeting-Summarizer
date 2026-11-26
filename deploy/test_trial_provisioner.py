import tempfile,unittest
from pathlib import Path
from unittest.mock import patch
import trial_provisioner as w
import trial_policy

class ProvisionerTests(unittest.TestCase):
    def test_unverified_or_legacy_never_provisioned(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            base=dict(ref="a"*32,name="Test Group",contact="Test Admin",email="admin@example.invalid",slug="test-group",sector="Corporate",plan="starter")
            with patch("trial_provisioner.resources_ok",return_value=True),patch("trial_provisioner.onboarding.inbox",return_value=[{**base,"status":"unverified"},{**base,"status":"verified"}]),patch("trial_provisioner.onboarding.pending_password",return_value=None),patch("trial_provisioner.operator_onboarding.approve") as approve:
                self.assertFalse(w.activate_one(root,root/"inbox.db",{}))
                approve.assert_not_called()
    def test_disabled_and_resource_guard(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            trial_policy.configure(root,30,0)
            with patch("trial_provisioner.onboarding.inbox") as inbox:
                self.assertFalse(w.activate_one(root,root/"inbox.db",{}))
                inbox.assert_not_called()
    def test_route_is_exact_and_no_other_host(self):
        row=dict(slug="example",host="example"+w.SUFFIX,port=19100,admin_email="admin@example.invalid")
        config=w.route_config(row)
        self.assertIn("proxy_pass http://127.0.0.1:19100",config)
        self.assertIn("server_name example"+w.SUFFIX,config)
        with self.assertRaises(ValueError):w.route_config({**row,"host":"another.example.com"})
    def test_password_ready_activation(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            app=dict(ref="b"*32,name="Test Group",contact="Test Admin",email="admin@example.invalid",slug="test-group",sector="Corporate",plan="starter",status="verified")
            rows={}
            def approve(path,root,rows,ref,host,port,*args):
                row=dict(slug=app["slug"],host=host,port=port,admin_email=app["email"],registration_ref=ref,enabled=False,profile={})
                rows[row["slug"]]=row
                return row
            def start(root,row):row["enabled"]=True
            with patch("trial_provisioner.resources_ok",return_value=True),patch("trial_provisioner.dns_ready",return_value=True),patch("trial_provisioner.onboarding.inbox",return_value=[app]),patch("trial_provisioner.onboarding.pending_password",return_value="test-hash"),patch("trial_provisioner.operator_onboarding.approve",side_effect=approve),patch("trial_provisioner.available_port",return_value=19100),patch("trial_provisioner.entitlements.publish"),patch("trial_provisioner.start_stack",side_effect=start),patch("trial_provisioner.configure_route") as route,patch("trial_provisioner.operator_onboarding.finish_password",return_value=True) as finish:
                self.assertTrue(w.activate_one(root,root/"inbox.db",rows))
                self.assertTrue(rows[app["slug"]]["enabled"])
                route.assert_called_once()
                finish.assert_called_once()
