import unittest
from unittest.mock import patch
import public_registration as registration

class CentralMigrationTests(unittest.TestCase):
    def test_legacy_verified_records_never_redirect(self):
        for status in ('verified','provisioned','setup_sent','activated'):
            with self.subTest(status=status):
                body=registration.verified_page({'status':status,'host':'legacy.minuteseal.arosoftlabs.com','password_ready':True})
                self.assertNotIn('legacy.minuteseal.arosoftlabs.com',body)
                self.assertNotIn('being prepared',body)
                self.assertNotIn('http-equiv="refresh"',body)
                self.assertIn('temporarily unavailable',body)
    def test_legacy_get_does_not_redirect(self):
        for status in ('activated','setup_sent','verified'):
            handler=registration.Handler.__new__(registration.Handler)
            handler.headers={'Host':'minuteseal.arosoftlabs.com'}
            handler.server=type('Server',(),{'hostname':'minuteseal.arosoftlabs.com','inbox':'unused'})()
            handler.route_path=lambda:'/verify'
            handler.browser_session=lambda:('ref','key')
            result=[]
            handler.respond=lambda body,**kw:result.append((body,kw))
            with patch.object(registration.onboarding,'browser_state',return_value={'status':status,'host':'legacy.minuteseal.arosoftlabs.com','password_ready':True}):
                handler.do_GET()
            self.assertEqual(len(result),1)
            self.assertNotIn('location',result[0][1])
            self.assertNotIn('legacy.minuteseal.arosoftlabs.com',result[0][0])
