import html
import smtplib
import ssl
from email.message import EmailMessage
from typing import Iterable

from app.core.config import settings


class EmailService:
    @property
    def enabled(self) -> bool:
        return bool(
            settings.SMTP_HOST
            and settings.SMTP_USERNAME
            and settings.SMTP_PASSWORD
        )

    def send(self, recipients: Iterable[str], subject: str, text: str, html_body: str) -> int:
        unique_recipients = sorted({address.strip() for address in recipients if address and address.strip()})
        if not unique_recipients:
            return 0
        if not self.enabled:
            raise RuntimeError("SMTP credentials are not configured")

        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = str(settings.SMTP_FROM_EMAIL)
        message["To"] = ", ".join(unique_recipients)
        message.set_content(text)
        message.add_alternative(html_body, subtype="html")

        context = ssl.create_default_context()
        if not settings.SMTP_VERIFY_TLS:
            context.check_hostname = False
            context.verify_mode = ssl.CERT_NONE
        if settings.SMTP_USE_SSL:
            with smtplib.SMTP_SSL(
                settings.SMTP_HOST,
                settings.SMTP_PORT,
                timeout=30,
                context=context,
            ) as server:
                server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                server.send_message(message)
        else:
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30) as server:
                server.ehlo()
                if settings.SMTP_USE_STARTTLS:
                    server.starttls(context=context)
                    server.ehlo()
                server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                server.send_message(message)
        return len(unique_recipients)

    def send_meeting_complete(
        self,
        recipients: Iterable[str],
        meeting_title: str,
        meeting_id: int,
        summary: str,
    ) -> int:
        public_url = f"https://oms.arosoftlabs.com/meetings/{meeting_id}"
        safe_title = html.escape(meeting_title)
        safe_summary = html.escape(summary)
        return self.send(
            recipients,
            f"Meeting minutes ready: {meeting_title}",
            (
                f'The transcript and minutes for "{meeting_title}" are ready.\n\n'
                f"{summary}\n\nView: {public_url}"
            ),
            (
                f"<h2>{safe_title}</h2>"
                "<p>The transcript and meeting minutes are ready.</p>"
                f"<p>{safe_summary}</p>"
                f'<p><a href="{public_url}">View meeting minutes</a></p>'
            ),
        )


email_service = EmailService()
