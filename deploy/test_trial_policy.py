import tempfile,unittest
from pathlib import Path
from datetime import datetime,timezone
from unittest.mock import patch
import trial_policy

class TrialTests(unittest.TestCase):
    def test_default_custom_and_no_reset(self):
        with tempfile.TemporaryDirectory() as d, patch("trial_policy.entitlements.publish"):
            root=Path(d)
            self.assertEqual(trial_policy.days(root),30)
            row={"profile":{}}
            clock=datetime(2026,11,26,12,tzinfo=timezone.utc)
            trial_policy.start(root,row,clock)
            self.assertEqual(row["profile"]["expiry"],"2026-12-25")
            self.assertEqual(row["profile"]["trial_days"],30)
            trial_policy.configure(root,14)
            trial_policy.start(root,row,clock)
            self.assertEqual(row["profile"]["trial_days"],30)
            row={"profile":{}}
            trial_policy.start(root,row,clock)
            self.assertEqual(row["profile"]["expiry"],"2026-12-09")
            with self.assertRaises(ValueError):trial_policy.configure(root,0)
