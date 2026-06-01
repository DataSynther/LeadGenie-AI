import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


class EmailSender:
    """Sends outreach emails via Gmail SMTP using a dedicated LeadGenie Gmail account.

    Configure in .env:
        LEADGENIE_GMAIL=leadgenie@gmail.com
        LEADGENIE_GMAIL_PASSWORD=xxxx xxxx xxxx xxxx   (Gmail app password)
    Replies come back to the same address — no separate reply-to needed.
    """

    def __init__(self):
        self.user     = os.getenv("LEADGENIE_GMAIL", "")
        self.password = os.getenv("LEADGENIE_GMAIL_PASSWORD", "")

    def send(self, to_email: str, subject: str, body: str, reply_to: str = None) -> dict:
        if not self.user or not self.password:
            return {"sent": False, "to": to_email, "error": "LEADGENIE_GMAIL or LEADGENIE_GMAIL_PASSWORD not set in .env"}

        try:
            msg = MIMEMultipart()
            msg["From"]     = self.user
            msg["To"]       = to_email
            msg["Subject"]  = subject
            msg["Reply-To"] = reply_to or self.user  # replies come back to same inbox

            msg.attach(MIMEText(body, "plain"))

            with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
                server.login(self.user, self.password)
                server.sendmail(self.user, to_email, msg.as_string())

            return {"sent": True, "to": to_email, "error": None}
        except Exception as e:
            return {"sent": False, "to": to_email, "error": str(e)}
