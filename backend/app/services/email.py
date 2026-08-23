import html
import smtplib
import ssl
from datetime import datetime
from email.message import EmailMessage
from typing import Iterable, Optional

from app.core.config import settings


class EmailService:
    @property
    def enabled(self) -> bool:
        return bool(settings.SMTP_HOST and settings.SMTP_USERNAME and settings.SMTP_PASSWORD)

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
            raise RuntimeError(
                "SMTP credentials are not configured. Set SMTP_HOST, SMTP_USERNAME and SMTP_PASSWORD in Coolify."
            )
        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = str(settings.SMTP_FROM_EMAIL)
        message["To"] = str(settings.SMTP_FROM_EMAIL)
        message["Bcc"] = ", ".join(unique_recipients)
        message.set_content(text)
        message.add_alternative(html_body, subtype="html")
        if attachment:
            message.add_attachment(attachment, maintype="application", subtype="pdf", filename=attachment_filename)

        context = ssl.create_default_context()
        if not settings.SMTP_VERIFY_TLS:
            context.check_hostname = False
            context.verify_mode = ssl.CERT_NONE
        if settings.SMTP_USE_SSL:
            with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30, context=context) as server:
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

    @staticmethod
    def _brand_header() -> str:
        logo = f"{settings.PUBLIC_APP_URL}/starlight-logo.jpg"
        return (
            '<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#1f2937">'
            '<div style="text-align:center;border-bottom:3px solid #173ea5;padding:18px 0">'
            f'<img src="{html.escape(logo)}" alt="Starlight S.S" width="110" style="max-width:110px;height:auto">'
            '<h2 style="margin:8px 0 2px;color:#173ea5">STARLIGHT SECONDARY SCHOOL</h2>'
            '<div style="font-size:12px;color:#4b5563">RISE AND SHINE</div></div>'
        )

    def send_meeting_invitation(self, recipient: str, meeting_title: str, meeting_date: datetime, invitation_url: str, organization_name: str) -> int:
        safe_title = html.escape(meeting_title)
        safe_org = html.escape(organization_name)
        safe_url = html.escape(invitation_url)
        date_text = meeting_date.strftime("%d %B %Y at %H:%M") if meeting_date else "Scheduled meeting"
        return self.send(
            [recipient],
            f"Meeting invitation: {meeting_title}",
            f"You have been invited to {meeting_title} at {organization_name}.\nMeeting: {date_text}\n\nOpen your meeting link:\n{invitation_url}\n\nIf the organiser has not started the meeting yet, the page will show the live countdown and waiting room.",
            self._brand_header()
            + f'<div style="padding:24px"><p>You have been invited to:</p><h3>{safe_title}</h3>'
            + f'<p><b>Date &amp; time:</b> {html.escape(date_text)}</p><p>{safe_org}</p>'
            + f'<p><a href="{safe_url}" style="display:inline-block;background:#173ea5;color:white;padding:13px 20px;text-decoration:none;border-radius:7px;font-weight:bold">Join Meeting</a></p>'
            + '<p style="font-size:12px;color:#6b7280">There is no accept/decline step. Open the link; if the meeting has not started, you will wait on the countdown page until the organiser starts it.</p></div></div>',
        )

    def send_final_minutes(self, recipients: Iterable[str], meeting_title: str, meeting_id: int, pdf_data: bytes, organization_name: str) -> int:
        public_url = f"{settings.PUBLIC_APP_URL}/meetings/{meeting_id}"
        return self.send(
            recipients,
            f"Final meeting minutes: {meeting_title}",
            f'Please find attached the approved final minutes for "{meeting_title}" from {organization_name}.\n\n{public_url}',
            self._brand_header()
            + f'<div style="padding:24px"><h3>{html.escape(meeting_title)}</h3><p>Attached are the approved final meeting minutes from {html.escape(organization_name)}.</p>'
            + f'<p><a href="{html.escape(public_url)}">Open the meeting record</a></p></div></div>',
            attachment=pdf_data,
            attachment_filename=f"{meeting_title[:50].replace('/', '-')}-final-minutes.pdf",
        )

    def send_meeting_complete(
        self,
        recipients: Iterable[str],
        meeting_title: str,
        meeting_id: int,
        summary: str,
        pdf_data: Optional[bytes] = None,
    ) -> int:
        public_url = f"{settings.PUBLIC_APP_URL}/meetings/{meeting_id}"
        attachment_note = "\n\nThe generated meeting minutes are attached as a PDF." if pdf_data else ""
        html_attachment_note = "<p><b>The generated meeting minutes are attached as a PDF.</b></p>" if pdf_data else ""
        return self.send(
            recipients,
            f"Meeting minutes ready: {meeting_title}",
            f'The transcript and minutes for "{meeting_title}" are ready.\n\n{summary}{attachment_note}\n\nView: {public_url}',
            self._brand_header()
            + f'<div style="padding:24px"><h3>{html.escape(meeting_title)}</h3><p>The transcript and meeting minutes are ready.</p>'
            + html_attachment_note
            + f'<p>{html.escape(summary)}</p><p><a href="{html.escape(public_url)}">View meeting minutes</a></p></div></div>',
            attachment=pdf_data,
            attachment_filename=f"{meeting_title[:50].replace('/', '-')}-generated-minutes.pdf",
        )


email_service = EmailService()
