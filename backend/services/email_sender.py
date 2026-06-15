import os
import smtplib
import urllib.request
import urllib.error
import json
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


class EmailSender:
    """Sends outreach emails via Resend API (primary) with Gmail SMTP fallback.

    On AWS ECS, outbound SMTP is blocked — Resend uses HTTPS so it always works.
    Locally, if RESEND_API_KEY is set it uses Resend; otherwise falls back to SMTP.

    Configure in .env / Secrets Manager:
        RESEND_API_KEY=re_...            (primary — works everywhere)
        LEADGENIE_GMAIL=...             (SMTP fallback — local only)
        LEADGENIE_GMAIL_PASSWORD=...    (SMTP fallback — local only)
    """

    def __init__(self):
        self.resend_key   = os.getenv("RESEND_API_KEY", "")
        self.gmail_user   = os.getenv("LEADGENIE_GMAIL", "")
        self.gmail_pass   = os.getenv("LEADGENIE_GMAIL_PASSWORD", "")
        self.from_address = os.getenv("LEADGENIE_GMAIL", "onboarding@resend.dev")

    def send(self, to_email: str, subject: str, body: str, reply_to: str = None) -> dict:
        if self.resend_key:
            return self._send_resend(to_email, subject, body, reply_to)
        if self.gmail_user and self.gmail_pass:
            return self._send_smtp(to_email, subject, body, reply_to)
        return {"sent": False, "to": to_email, "error": "No email credentials configured (RESEND_API_KEY or LEADGENIE_GMAIL)"}

    def _send_resend(self, to_email: str, subject: str, body: str, reply_to: str = None) -> dict:
        payload = {
            "from": self.from_address,
            "to": [to_email],
            "subject": subject,
            "text": body,
        }
        if reply_to:
            payload["reply_to"] = reply_to

        try:
            data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(
                "https://api.resend.com/emails",
                data=data,
                headers={
                    "Authorization": f"Bearer {self.resend_key}",
                    "Content-Type": "application/json",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                result = json.loads(resp.read().decode())
                return {"sent": True, "to": to_email, "id": result.get("id"), "error": None}
        except urllib.error.HTTPError as e:
            body_err = e.read().decode()
            return {"sent": False, "to": to_email, "error": f"Resend HTTP {e.code}: {body_err}"}
        except Exception as e:
            return {"sent": False, "to": to_email, "error": f"Resend error: {str(e)}"}

    def _send_smtp(self, to_email: str, subject: str, body: str, reply_to: str = None) -> dict:
        try:
            msg = MIMEMultipart()
            msg["From"]     = self.gmail_user
            msg["To"]       = to_email
            msg["Subject"]  = subject
            msg["Reply-To"] = reply_to or self.gmail_user

            msg.attach(MIMEText(body, "plain"))

            with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
                server.login(self.gmail_user, self.gmail_pass)
                server.sendmail(self.gmail_user, to_email, msg.as_string())

            return {"sent": True, "to": to_email, "error": None}
        except Exception as e:
            return {"sent": False, "to": to_email, "error": f"SMTP error: {str(e)}"}
