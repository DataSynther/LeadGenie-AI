import json
from pathlib import Path
from typing import Optional

STORE_DIR = Path(__file__).parent.parent / "storage" / "lead_contexts"
STORE_DIR.mkdir(parents=True, exist_ok=True)


class LeadContextStore:
    """Persists lead context (research, company, signals) keyed by the lead's email address.

    Written when an outreach email is sent so that when a reply arrives via the
    inbound webhook, we can reconstruct context without re-running the full pipeline.
    """

    def save(self, lead_email: str, lead_id: str, context: dict) -> None:
        path = STORE_DIR / f"{self._key(lead_email)}.json"
        with open(path, "w") as f:
            json.dump({"lead_id": lead_id, "context": context}, f, indent=2)

    def get_by_email(self, lead_email: str) -> Optional[dict]:
        """Returns {lead_id, context} or None if this email has no stored context."""
        path = STORE_DIR / f"{self._key(lead_email)}.json"
        if not path.exists():
            return None
        with open(path) as f:
            return json.load(f)

    def get_by_phone(self, phone: str) -> Optional[dict]:
        normalized = self._normalize_phone(phone)
        if not normalized:
            return None

        for path in STORE_DIR.glob("*.json"):
            with open(path) as f:
                record = json.load(f)
            context = record.get("context") or {}
            lead = context.get("lead") or {}
            candidate = lead.get("phone")
            if self._normalize_phone(candidate) == normalized:
                return record
        return None

    @staticmethod
    def _key(email: str) -> str:
        return email.lower().replace("@", "_at_").replace(".", "_")

    @staticmethod
    def _normalize_phone(phone: str) -> str:
        normalized = (phone or "").replace(" ", "").strip()
        if normalized.lower().startswith("whatsapp:"):
            normalized = normalized.split(":", 1)[1]
        return normalized
