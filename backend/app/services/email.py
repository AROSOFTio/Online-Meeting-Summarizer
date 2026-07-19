import html
import smtplib
import ssl
from email.message import EmailMessage
from typing import Iterable, Optional

from app.core.config import settings


class EmailService:
    @property
    def enabled(self) -> bool:
        return bool(
            settings.SMTP_HOST
            and settings.SMTP_USERNAME
            and settings.SMTP_PASSWORD
        )

    def send(
        self,
        recipients: Iterable[str],
        subject: str,
        text: str,
        html_body: str,
        attachment: Optional[bytes] = None,
        attachment_filename: str = "minutes.pdf",
    ) -> int:
        unique_recipients = sorted({address.strip() for address in recipients if address and address.strip()})
        if not unique_recipients:
            return 0
        if not self.enabled:
            raise RuntimeError("SMTP credentials are not configured")

        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = str(settings.SMTP_FROM_EMAIL)
        # Keep participant addresses private from one another.
        message["To"] = str(settings.SMTP_FROM_EMAIL)
        message["Bcc"] = ", ".join(unique_recipients)
        message.set_content(text)
        message.add_alternative(html_body, subtype="html")
        if attachment:
            message.add_attachment(
                attachment,
                maintype="application",
                subtype="pdf",
                filename=attachment_filename,
            )

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

    def send_final_minutes(
        self,
        recipients: Iterable[str],
        meeting_title: str,
        meeting_id: int,
        pdf_data: bytes,
        organization_name: str,
    ) -> int:
        public_url = f"https://oms.arosoftlabs.com/meetings/{meeting_id}"
        safe_title = html.escape(meeting_title)
        safe_org = html.escape(organization_name)
        return self.send(
            recipients,
            f"Final meeting minutes: {meeting_title}",
            (
                f"Please find attached the approved final minutes for \"{meeting_title}\" "
                f"from {organization_name}.\n\nA copy remains available at {public_url}"
            ),
            (
                f"<h2>{safe_title}</h2>"
                f"<p>Please find attached the approved final meeting minutes from {safe_org}.</p>"
                f'<p>The official copy also remains available from the <a href="{public_url}">meeting record</a>.</p>'
            ),
            attachment=pdf_data,
            attachment_filename=f"{meeting_title[:50].replace('/', '-')}-final-minutes.pdf",
        )

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
