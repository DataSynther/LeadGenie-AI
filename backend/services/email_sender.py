import os
import resend


class EmailSender:
    """Sends outreach emails via Resend API."""

    def __init__(self):
        resend.api_key = os.getenv("RESEND_API_KEY", "")
        self.from_email = os.getenv("FROM_EMAIL", "onboarding@resend.dev")

    def send(self, to_email: str, subject: str, body: str) -> dict:
        """
        Send a plain-text outreach email.
        Returns {sent: bool, to: str, error: str|None}
        """
        if not resend.api_key:
            return {
                "sent": False,
                "to": to_email,
                "error": "RESEND_API_KEY not configured in .env",
            }

        try:
            response = resend.Emails.send({
                "from": self.from_email,
                "to": [to_email],
                "subject": subject,
                "text": body,
            })
            return {"sent": True, "to": to_email, "error": None, "id": response.get("id")}
        except Exception as e:
            return {"sent": False, "to": to_email, "error": str(e)}
