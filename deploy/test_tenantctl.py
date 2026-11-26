import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import tenantctl


class TenantProvisioningTests(unittest.TestCase):
    def test_unique_stacks_credentials_and_proxy(self):
        with tempfile.TemporaryDirectory() as d, patch("tenantctl.socket.socket") as sock:
            root=Path(d)
            rows={}
            a=tenantctl.provision(root,rows,"alpha","alpha.example.com","admin@example.com",19081)
            b=tenantctl.provision(root,rows,"bravo","bravo.example.com","admin@example.com",19082)
            for key in ("DB_PASSWORD","SECRET_KEY","ADMIN_PASSWORD"):
                ea=dict(line.split("=",1) for line in (root/"alpha/tenant.env").read_text().splitlines())
                eb=dict(line.split("=",1) for line in (root/"bravo/tenant.env").read_text().splitlines())
                self.assertNotEqual(ea[key],eb[key])
            self.assertIn("cc-alpha",tenantctl.compose_command(root,a,"up"))
            self.assertIn("cc-bravo",tenantctl.compose_command(root,b,"up"))
            self.assertEqual((root/"alpha/tenant.env").stat().st_mode & 0o777,0o600)
            a["enabled"]=True
            conf=tenantctl.nginx_config(rows)
            self.assertIn("alpha.example.com",conf)
            self.assertIn("127.0.0.1:19081",conf)
            self.assertNotIn("bravo.example.com",conf)
            with self.assertRaises(ValueError):
                tenantctl.provision(root,rows,"charlie","alpha.example.com","admin@example.com",19083)
            with self.assertRaises(ValueError):
                tenantctl.provision(root,rows,"charlie","charlie.example.com","admin@example.com",19081)
    def test_invalid_injection_values(self):
        for slug,host,email in [("../alpha","alpha.example.com","admin@example.com"),("alpha","alpha.example.com;","admin@example.com"),("alpha","alpha.example.com","bad'@example.com")]:
            with self.assertRaises(ValueError):
                tenantctl.validate(slug,host,email,19081)


if __name__=="__main__":
    unittest.main()
