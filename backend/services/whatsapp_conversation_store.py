import json
import logging
import hashlib
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
        normalized_phone = self._normalize_phone(phone)
        conversation_id = self._conversation_id(normalized_phone) if normalized_phone else lead_id
        found = self._find(conversation_id) if normalized_phone else self._find(lead_id)
        record = found[1] if found else self._new_record(lead_id, context, normalized_phone)

        record["conversation_id"] = conversation_id
        if not found:
            record["lead_id"] = lead_id
        if context and not record.get("context"):
            record["context"] = context
        if normalized_phone:
            record["phone"] = normalized_phone

        entry = {
            "conversation_id": conversation_id,
            "lead_id": lead_id,
            "channel": "whatsapp",
            "direction": direction,
            "message": message,
            "phone": normalized_phone,
            "timestamp": datetime.utcnow().isoformat(),
        }
        record["messages"].append(entry)
        record["updated_at"] = entry["timestamp"]

        if direction == "inbound":
            record["status"] = "awaiting_human"
            record["unread"] = True
        elif record.get("status") == "awaiting_human":
            record["status"] = "human_responded"

        storage_key = found[0] if found else conversation_id
        self._write(storage_key, record)
        logger.info(
            "Stored WhatsApp %s message conversation_id=%s lead_id=%s phone=%s status=%s unread=%s",
            direction,
            conversation_id,
            lead_id,
            normalized_phone,
            record.get("status"),
            record.get("unread"),
        )
        return record

    def list_active(self) -> list[dict]:
        conversations = []
        for path in STORE_DIR.glob("*.json"):
            with open(path) as f:
                record = json.load(f)
            if record.get("status") in {"awaiting_human", "human_responded"}:
                conversations.append(self._summary(record))
        return sorted(conversations, key=lambda c: c.get("updated_at") or "", reverse=True)

    def list_awaiting_human(self) -> list[dict]:
        return [conv for conv in self.list_active() if conv.get("status") == "awaiting_human"]

    def unread_count(self) -> int:
        return sum(1 for conv in self.list_active() if conv.get("unread"))

    def get(self, conversation_id: str) -> Optional[dict]:
        found = self._find(conversation_id)
        return found[1] if found else None

    def mark_opened(self, conversation_id: str) -> Optional[dict]:
        found = self._find(conversation_id)
        if not found:
            return None
        storage_key, record = found
        record["unread"] = False
        self._write(storage_key, record)
        return record

    def delete(self, conversation_id: str) -> bool:
        found = self._find(conversation_id)
        if not found:
            return False
        storage_key, _record = found
        self._path(storage_key).unlink(missing_ok=True)
        logger.info("Deleted WhatsApp conversation conversation_id=%s storage_key=%s", conversation_id, storage_key)
        return True

    def _summary(self, record: dict) -> dict:
        context = record.get("context", {})
        lead = context.get("lead", {})
        company = context.get("company", {})
        phone = self._normalize_phone(record.get("phone") or lead.get("phone"))
        conversation_id = record.get("conversation_id") or self._conversation_id(phone) or record.get("lead_id")
        messages = self._messages_for_conversation(record, conversation_id, phone)
        last = messages[-1] if messages else {}
        return {
            "conversation_id": conversation_id,
            "lead_id": record.get("lead_id"),
            "lead_name": lead.get("name") or "Unknown lead",
            "company_name": company.get("name") or lead.get("company") or "Unknown company",
            "phone": phone,
            "status": record.get("status"),
            "unread": bool(record.get("unread")),
            "last_message": last.get("message", ""),
            "last_direction": last.get("direction"),
            "updated_at": record.get("updated_at"),
            "messages": messages,
        }

    def _messages_for_conversation(self, record: dict, conversation_id: str, phone: str) -> list[dict]:
        return [
            message
            for message in record.get("messages", [])
            if message.get("conversation_id") == conversation_id
            or self._normalize_phone(message.get("phone")) == phone
        ]

    def _new_record(self, lead_id: str, context: dict, phone: Optional[str]) -> dict:
        normalized_phone = self._normalize_phone(phone)
        return {
            "conversation_id": self._conversation_id(normalized_phone) if normalized_phone else lead_id,
            "lead_id": lead_id,
            "phone": normalized_phone,
            "context": context,
            "status": "awaiting_human",
            "unread": False,
            "messages": [],
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
        }

    def _find(self, conversation_id: str) -> Optional[tuple[str, dict]]:
        path = self._path(conversation_id)
        if path.exists():
            with open(path) as f:
                return conversation_id, json.load(f)

        for path in STORE_DIR.glob("*.json"):
            with open(path) as f:
                record = json.load(f)
            phone = self._normalize_phone(record.get("phone") or record.get("context", {}).get("lead", {}).get("phone"))
            record_conversation_id = record.get("conversation_id") or self._conversation_id(phone)
            if record_conversation_id == conversation_id or record.get("lead_id") == conversation_id:
                return path.stem, record
        return None

    def _write(self, storage_key: str, record: dict) -> None:
        with open(self._path(storage_key), "w") as f:
            json.dump(record, f, indent=2)

    def _path(self, storage_key: str) -> Path:
        return STORE_DIR / f"{storage_key}.json"

    @staticmethod
    def _normalize_phone(phone: Optional[str]) -> str:
        normalized = (phone or "").replace(" ", "").strip()
        if not normalized:
            return ""
        if normalized.lower().startswith("whatsapp:"):
            normalized = normalized.split(":", 1)[1]
        return f"whatsapp:{normalized}"

    @staticmethod
    def _conversation_id(phone: str) -> str:
        if not phone:
            return ""
        return "whatsapp_" + hashlib.sha256(phone.encode("utf-8")).hexdigest()[:16]
