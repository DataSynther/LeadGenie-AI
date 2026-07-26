import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication


class EmailSender:
    """Sends outreach emails via Gmail SMTP.

    AWS ECS blocks port 25 but not 465/587, so Gmail SMTP works.
    Tries port 587 (STARTTLS) first, falls back to port 465 (SSL).

    Configure in .env / Secrets Manager:
        LEADGENIE_GMAIL=...              (sender Gmail address)
        LEADGENIE_GMAIL_PASSWORD=...     (Gmail app password)
    """

    def __init__(self):
        self.gmail_user = os.getenv("LEADGENIE_GMAIL", "")
        self.gmail_pass = (
            os.getenv("LEADGENIE_GMAIL_PASSWORD", "")
            or os.getenv("GMAIL_APP_PASSWORD", "")
        )

    def send(
        self, to_email: str, subject: str, body: str, reply_to: str = None,
        attachments: list[tuple[str, bytes]] | None = None,
    ) -> dict:
        if not self.gmail_user or not self.gmail_pass:
            return {
                "sent": False,
                "to": to_email,
                "error": "No email credentials — set LEADGENIE_GMAIL + LEADGENIE_GMAIL_PASSWORD",
            }
        return self._send_smtp(to_email, subject, body, reply_to, attachments)

    def _send_smtp(
        self, to_email: str, subject: str, body: str, reply_to: str = None,
        attachments: list[tuple[str, bytes]] | None = None,
    ) -> dict:
        msg = MIMEMultipart()
        msg["From"]     = self.gmail_user
        msg["To"]       = to_email
        msg["Subject"]  = subject
        msg["Reply-To"] = reply_to or self.gmail_user
        msg.attach(MIMEText(body, "plain"))
        for filename, data in (attachments or []):
            part = MIMEApplication(data, Name=filename)
            part["Content-Disposition"] = f'attachment; filename="{filename}"'
            msg.attach(part)

        last_error = ""

        # Port 587 / STARTTLS — preferred, less likely to be filtered
        try:
            with smtplib.SMTP("smtp.gmail.com", 587, timeout=15) as server:
                server.ehlo()
                server.starttls()
                server.ehlo()
                server.login(self.gmail_user, self.gmail_pass)
                server.sendmail(self.gmail_user, to_email, msg.as_string())
            return {"sent": True, "to": to_email, "error": None}
        except Exception as e:
            last_error = f"587/STARTTLS: {e}"

        # Port 465 / SSL — fallback
        try:
            with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=15) as server:
                server.login(self.gmail_user, self.gmail_pass)
                server.sendmail(self.gmail_user, to_email, msg.as_string())
            return {"sent": True, "to": to_email, "error": None}
        except Exception as e:
            last_error = f"{last_error} | 465/SSL: {e}"

        return {"sent": False, "to": to_email, "error": f"SMTP failed: {last_error}"}
