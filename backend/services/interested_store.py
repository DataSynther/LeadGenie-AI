import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

STORE_DIR = Path(__file__).parent.parent / "storage" / "interested"
STORE_DIR.mkdir(parents=True, exist_ok=True)


class InterestedStore:
    """File-backed store for leads that replied to outreach."""

    def record_reply(
        self,
        lead_id: str,
        context: dict,
        reply: str,
        intent: Optional[str] = None,
        intent_confidence: Optional[float] = None,
        lead_email: Optional[str] = None,
    ) -> dict:
        path = self._path(lead_id)
        existing = self.get(lead_id) or {}
        replies = existing.get("replies") or []
        now = datetime.now(timezone.utc).isoformat()
        replies.append({
            "reply": reply,
            "intent": intent,
            "intent_confidence": intent_confidence,
            "timestamp": now,
            "lead_email": lead_email,
        })

        lead = context.get("lead") or {}
        company = context.get("company") or {}
        record = {
            "lead_id": lead_id,
            "lead_name": lead.get("name") or existing.get("lead_name") or "",
            "company_name": company.get("name") or existing.get("company_name") or "",
            "lead_title": lead.get("title") or existing.get("lead_title") or "",
            "lead_email": lead_email or lead.get("email") or existing.get("lead_email") or "",
            "reply_content": reply,
            "detected_intent": intent or "neutral",
            "intent_confidence": intent_confidence,
            "timestamp": now,
            "context": context,
            "replies": replies,
        }
        path.write_text(json.dumps(record, indent=2))
        return record

    def list_all(self) -> list[dict]:
        records = []
        for path in STORE_DIR.glob("*.json"):
            try:
                records.append(json.loads(path.read_text()))
            except json.JSONDecodeError:
                continue
        records.sort(key=lambda r: r.get("timestamp", ""), reverse=True)
        return records

    def get(self, lead_id: str) -> Optional[dict]:
        path = self._path(lead_id)
        if not path.exists():
            return None
        try:
            return json.loads(path.read_text())
        except json.JSONDecodeError:
            return None

    def _path(self, lead_id: str) -> Path:
        safe = str(lead_id).replace("/", "_").replace("\\", "_")
        return STORE_DIR / f"{safe}.json"
