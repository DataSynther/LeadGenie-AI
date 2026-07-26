import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


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
        self.gmail_pass = "".join(self.gmail_pass.split())

    def send(self, to_email: str, subject: str, body: str, reply_to: str = None) -> dict:
        if not self.gmail_user or not self.gmail_pass:
            return {
                "sent": False,
                "to": to_email,
                "error": "Email configuration missing: set LEADGENIE_GMAIL and LEADGENIE_GMAIL_PASSWORD",
                "error_type": "missing_email_credentials",
            }
        return self._send_smtp(to_email, subject, body, reply_to)

    def _send_smtp(self, to_email: str, subject: str, body: str, reply_to: str = None) -> dict:
        msg = MIMEMultipart()
        msg["From"] = self.gmail_user
        msg["To"] = to_email
        msg["Subject"] = subject
        msg["Reply-To"] = reply_to or self.gmail_user
        msg.attach(MIMEText(body, "plain"))

        last_error = ""
        error_type = "smtp_error"

        try:
            with smtplib.SMTP("smtp.gmail.com", 587, timeout=15) as server:
                server.ehlo()
                server.starttls()
                server.ehlo()
                server.login(self.gmail_user, self.gmail_pass)
                server.sendmail(self.gmail_user, to_email, msg.as_string())
            return {"sent": True, "to": to_email, "error": None}
        except Exception as exc:
            last_error = f"587/STARTTLS: {exc}"
            error_type = self._classify_smtp_error(exc)

        try:
            with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=15) as server:
                server.login(self.gmail_user, self.gmail_pass)
                server.sendmail(self.gmail_user, to_email, msg.as_string())
            return {"sent": True, "to": to_email, "error": None}
        except Exception as exc:
            logger.exception("Gmail SMTP send failed via 465/SSL")
            last_error = f"{last_error} | 465/SSL: {exc}"
            fallback_type = self._classify_smtp_error(exc)
            if fallback_type != "smtp_error":
                error_type = fallback_type

        return {
            "sent": False,
            "to": to_email,
            "error": f"Email provider error ({error_type}): {last_error}",
            "error_type": error_type,
        }

    @staticmethod
    def _classify_smtp_error(error: Exception) -> str:
        if isinstance(error, UnicodeEncodeError):
            return "invalid_email_address"
        if isinstance(error, smtplib.SMTPAuthenticationError):
            return "gmail_smtp_authentication_failed"
        if isinstance(error, smtplib.SMTPRecipientsRefused):
            return "recipient_refused"
        if isinstance(error, TimeoutError):
            return "network_timeout"
        if isinstance(error, (OSError, smtplib.SMTPConnectError, smtplib.SMTPServerDisconnected)):
            return "smtp_connection_failed"
        if isinstance(error, smtplib.SMTPResponseException):
            return "email_provider_rejected"
        return "smtp_error"
