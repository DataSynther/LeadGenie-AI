import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional

STORE_DIR = Path(__file__).parent.parent / "storage" / "whatsapp_conversations"
STORE_DIR.mkdir(parents=True, exist_ok=True)

logger = logging.getLogger(__name__)


class WhatsAppConversationStore:
    """Stores human-controlled WhatsApp conversations and notification state."""

    def add_message(
        self,
        lead_id: str,
        context: dict,
        direction: str,
        message: str,
        phone: Optional[str] = None,
    ) -> dict:
        record = self.get(lead_id) or self._new_record(lead_id, context, phone)
        if context:
            record["context"] = context
        if phone:
            record["phone"] = phone

        entry = {
            "lead_id": lead_id,
            "channel": "whatsapp",
            "direction": direction,
            "message": message,
            "timestamp": datetime.utcnow().isoformat(),
        }
        record["messages"].append(entry)
        record["updated_at"] = entry["timestamp"]

        if direction == "inbound":
            record["status"] = "awaiting_human"
            record["unread"] = True
        elif record.get("status") == "awaiting_human":
            record["status"] = "human_responded"

        self._write(lead_id, record)
        logger.info(
            "Stored WhatsApp %s message lead_id=%s status=%s unread=%s",
            direction,
            lead_id,
            record.get("status"),
            record.get("unread"),
        )
        return record

    def list_awaiting_human(self) -> list[dict]:
        conversations = []
        for path in STORE_DIR.glob("*.json"):
            with open(path) as f:
                record = json.load(f)
            if record.get("status") == "awaiting_human":
                conversations.append(self._summary(record))
        return sorted(conversations, key=lambda c: c.get("updated_at") or "", reverse=True)

    def unread_count(self) -> int:
        return sum(1 for conv in self.list_awaiting_human() if conv.get("unread"))

    def get(self, lead_id: str) -> Optional[dict]:
        path = self._path(lead_id)
        if not path.exists():
            return None
        with open(path) as f:
            return json.load(f)

    def mark_opened(self, lead_id: str) -> Optional[dict]:
        record = self.get(lead_id)
        if not record:
            return None
        record["unread"] = False
        self._write(lead_id, record)
        return record

    def _summary(self, record: dict) -> dict:
        context = record.get("context", {})
        lead = context.get("lead", {})
        company = context.get("company", {})
        messages = record.get("messages", [])
        last = messages[-1] if messages else {}
        return {
            "lead_id": record.get("lead_id"),
            "lead_name": lead.get("name") or "Unknown lead",
            "company_name": company.get("name") or lead.get("company") or "Unknown company",
            "phone": record.get("phone") or lead.get("phone"),
            "status": record.get("status"),
            "unread": bool(record.get("unread")),
            "last_message": last.get("message", ""),
            "last_direction": last.get("direction"),
            "updated_at": record.get("updated_at"),
            "messages": messages,
        }

    def _new_record(self, lead_id: str, context: dict, phone: Optional[str]) -> dict:
        return {
            "lead_id": lead_id,
            "phone": phone,
            "context": context,
            "status": "awaiting_human",
            "unread": False,
            "messages": [],
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
        }

    def _write(self, lead_id: str, record: dict) -> None:
        with open(self._path(lead_id), "w") as f:
            json.dump(record, f, indent=2)

    def _path(self, lead_id: str) -> Path:
        return STORE_DIR / f"{lead_id}.json"
