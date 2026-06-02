import logging
import os
import time
import traceback

import requests

logger = logging.getLogger(__name__)


class TwilioWhatsApp:
    """Sends WhatsApp messages through Render Twilio service."""

    def __init__(self):
        self.api_url = os.getenv(
            "WHATSAPP_API_URL",
            "https://whatsapp-webhook1-nqek.onrender.com/send-whatsapp",
        )
        self.timeout = int(os.getenv("WHATSAPP_REQUEST_TIMEOUT_SECONDS", "90"))

    def send(self, phone: str, message: str) -> dict:
        normalized_phone = self._normalize_phone(phone)
        started_at = time.monotonic()
        logger.info(
            "Starting WhatsApp send api_url=%s phone=%r normalized_phone=%r "
            "message_len=%s timeout=%ss",
            self.api_url,
            phone,
            normalized_phone,
            len(message or ""),
            self.timeout,
        )
        try:
            response = requests.post(
                self.api_url,
                json={
                    "phone": normalized_phone,
                    "message": message,
                },
                timeout=self.timeout,
            )
            elapsed = round(time.monotonic() - started_at, 3)
            logger.info(
                "Finished WhatsApp send phone=%r normalized_phone=%r "
                "status_code=%s elapsed=%ss response=%r",
                phone,
                normalized_phone,
                response.status_code,
                elapsed,
                response.text,
            )

            return {
                "sent": response.status_code == 200,
                "to": phone,
                "normalized_to": normalized_phone,
                "status_code": response.status_code,
                "elapsed_seconds": elapsed,
                "error": None if response.status_code == 200 else response.text,
            }

        except Exception as e:
            elapsed = round(time.monotonic() - started_at, 3)
            trace = traceback.format_exc()
            logger.exception(
                "WhatsApp send failed phone=%r normalized_phone=%r elapsed=%ss",
                phone,
                normalized_phone,
                elapsed,
            )
            return {
                "sent": False,
                "to": phone,
                "normalized_to": normalized_phone,
                "status_code": None,
                "elapsed_seconds": elapsed,
                "error": str(e),
                "traceback": trace,
            }

    @staticmethod
    def _normalize_phone(phone: str) -> str:
        normalized = (phone or "").replace(" ", "").strip()
        if normalized.lower().startswith("whatsapp:"):
            normalized = normalized.split(":", 1)[1]
        return normalized
