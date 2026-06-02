import json
import logging
from pathlib import Path
from typing import Optional

STORE_DIR = Path(__file__).parent.parent / "storage" / "lead_contexts"
STORE_DIR.mkdir(parents=True, exist_ok=True)

logger = logging.getLogger(__name__)


class LeadContextStore:
    """Persists lead context (research, company, signals) keyed by the lead's email address.

    Written when an outreach email is sent so that when a reply arrives via the
    inbound webhook, we can reconstruct context without re-running the full pipeline.
    """

    def save(self, lead_email: str, lead_id: str, context: dict) -> None:
        normalized_email = self._normalize_email(lead_email)
        path = STORE_DIR / f"{self._key(lead_email)}.json"
        with open(path, "w") as f:
            json.dump(
                {
                    "lead_email": normalized_email,
                    "lead_id": lead_id,
                    "context": context,
                },
                f,
                indent=2,
            )
        logger.info(
            "Saved lead context lead_email=%s lead_id=%s path=%s",
            normalized_email,
            lead_id,
            path,
        )

    def get_by_email(self, lead_email: str) -> Optional[dict]:
        """Returns {lead_id, context} or None if this email has no stored context."""
        normalized_email = self._normalize_email(lead_email)
        path = STORE_DIR / f"{self._key(normalized_email)}.json"
        if not path.exists():
            logger.info("No lead context found for lead_email=%s path=%s", normalized_email, path)
            return None
        with open(path) as f:
            stored = json.load(f)
        logger.info(
            "Resolved lead context lead_email=%s lead_id=%s path=%s",
            normalized_email,
            stored.get("lead_id"),
            path,
        )
        return stored

    def get_by_phone(self, phone: str) -> Optional[dict]:
        """Returns {lead_id, context} for the first context whose lead phone matches."""
        normalized_phone = self._normalize_phone(phone)
        if not normalized_phone:
            return None
        for path in STORE_DIR.glob("*.json"):
            with open(path) as f:
                stored = json.load(f)
            context = stored.get("context", {})
            lead = context.get("lead", {})
            if self._normalize_phone(lead.get("phone")) == normalized_phone:
                logger.info(
                    "Resolved lead context by phone phone=%s lead_id=%s path=%s",
                    normalized_phone,
                    stored.get("lead_id"),
                    path,
                )
                return stored
        logger.info("No lead context found for phone=%s", normalized_phone)
        return None

    def list_lead_emails(self) -> list[str]:
        """Return all email addresses that have stored contexts."""
        emails = []
        for path in STORE_DIR.glob("*.json"):
            with open(path) as f:
                stored = json.load(f)
            email = stored.get("lead_email") or self._email_from_legacy_key(path.stem)
            if email:
                emails.append(self._normalize_email(email))
        logger.info("Loaded %s lead context email(s) from %s", len(emails), STORE_DIR)
        return emails

    @staticmethod
    def _key(email: str) -> str:
        return LeadContextStore._normalize_email(email).replace("@", "_at_").replace(".", "_")

    @staticmethod
    def _normalize_email(email: str) -> str:
        return (email or "").strip().lower()

    @staticmethod
    def _email_from_legacy_key(key: str) -> str:
        return key.replace("_at_", "@").replace("_", ".")

    @staticmethod
    def _normalize_phone(phone: str) -> str:
        normalized = (phone or "").replace(" ", "").strip()
        if normalized.lower().startswith("whatsapp:"):
            normalized = normalized.split(":", 1)[1]
        return normalized
