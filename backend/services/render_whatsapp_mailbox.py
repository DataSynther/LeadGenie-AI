import hashlib
import json
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Optional
from uuid import uuid4

import requests

from scheduling.followup_scheduler import FollowupScheduler
from services.lead_context_store import LeadContextStore
from services.whatsapp_conversation_store import WhatsAppConversationStore

STORE_DIR = Path(
    os.getenv(
        "WHATSAPP_LOCAL_MAILBOX_DIR",
        Path(__file__).parent.parent / "storage" / "render_mailbox",
    )
).resolve()
PENDING_PATH = STORE_DIR / "pending_messages.json"
PROCESSED_PATH = STORE_DIR / "processed_message_keys.json"

logger = logging.getLogger(__name__)


class RenderWhatsAppMailbox:
    """Stores Render mailbox payloads and imports pending messages into LeadGenie."""

    def __init__(self):
        self.pending_url = os.getenv(
            "WHATSAPP_PENDING_MESSAGES_URL",
            "https://whatsapp-webhook1-nqek.onrender.com/pending-messages",
        )
        self.timeout = int(os.getenv("WHATSAPP_PENDING_REQUEST_TIMEOUT_SECONDS", "20"))

    def store_inbound(self, from_phone: str, body: str) -> dict:
        message = {
            "id": uuid4().hex,
            "from": from_phone,
            "body": body,
            "received_at": datetime.utcnow().isoformat(),
        }
        pending = self.local_pending()
        pending.append(message)
        self._write_json(PENDING_PATH, pending)
        logger.info("Stored WhatsApp mailbox message from=%s pending=%s", from_phone, len(pending))
        return message

    def local_pending(self) -> list[dict]:
        STORE_DIR.mkdir(parents=True, exist_ok=True)
        if not PENDING_PATH.exists():
            return []
        with open(PENDING_PATH, encoding="utf-8") as f:
            if PENDING_PATH.stat().st_size == 0:
                return []
            return json.load(f)

    def fetch_remote_pending(self) -> list[dict]:
        response = requests.get(self.pending_url, timeout=self.timeout)
        response.raise_for_status()
        payload = response.json()
        if isinstance(payload, list):
            return payload
        return payload.get("messages") or payload.get("pending_messages") or []

    def import_remote_pending(self) -> dict:
        try:
            messages = self.fetch_remote_pending()
        except Exception as exc:
            logger.warning("Unable to fetch Render WhatsApp pending messages: %s", exc)
            return {
                "remote_url": self.pending_url,
                "fetched": 0,
                "imported": 0,
                "skipped": 0,
                "error": str(exc),
            }

        result = self.import_messages(messages)
        return {
            "remote_url": self.pending_url,
            "fetched": len(messages),
            **result,
        }

    def debug_status(self) -> dict:
        try:
            remote_messages = self.fetch_remote_pending()
            remote_error = None
        except Exception as exc:
            remote_messages = []
            remote_error = str(exc)

        conversations = WhatsAppConversationStore().list_awaiting_human()
        return {
            "remote_url": self.pending_url,
            "remote_error": remote_error,
            "remote_pending_count": len(remote_messages),
            "remote_pending_preview": remote_messages[-5:],
            "local_mailbox_count": len(self.local_pending()),
            "local_mailbox_dir": str(STORE_DIR),
            "local_mailbox_file": str(PENDING_PATH),
            "local_awaiting_human_count": len(conversations),
            "local_unread_count": WhatsAppConversationStore().unread_count(),
            "local_conversation_preview": conversations[:5],
        }

    def import_messages(self, messages: list[dict]) -> dict:
        processed = set(self._read_processed())
        imported = 0
        skipped = 0

        for message in messages:
            sender = (
                message.get("from")
                or message.get("From")
                or message.get("phone")
                or message.get("sender")
                or ""
            ).strip()
            body = (message.get("body") or message.get("Body") or message.get("message") or "").strip()
            received_at = message.get("received_at") or message.get("timestamp") or ""
            key = self._message_key(sender, body, received_at)

            if not sender or not body or key in processed:
                skipped += 1
                continue

            stored = self._resolve_context(sender)
            if not stored:
                lead_id = self._unknown_lead_id(sender)
                context = {
                    "lead": {
                        "id": lead_id,
                        "name": "Unknown WhatsApp Lead",
                        "phone": sender,
                    },
                    "company": {
                        "name": "Unknown company",
                    },
                }
                logger.warning("Importing pending WhatsApp message from unknown sender: %s", sender)
            else:
                lead_id = stored["lead_id"]
                context = stored["context"]
                FollowupScheduler().mark_replied(lead_id)

            WhatsAppConversationStore().add_message(
                lead_id=lead_id,
                context=context,
                direction="inbound",
                message=body,
                phone=sender,
            )
            processed.add(key)
            imported += 1

        self._write_json(PROCESSED_PATH, sorted(processed))
        return {"imported": imported, "skipped": skipped, "error": None}

    def _resolve_context(self, phone: str) -> Optional[dict]:
        return FollowupScheduler().get_by_phone(phone) or LeadContextStore().get_by_phone(phone)

    def _read_processed(self) -> list[str]:
        if not PROCESSED_PATH.exists():
            return []
        with open(PROCESSED_PATH, encoding="utf-8") as f:
            if PROCESSED_PATH.stat().st_size == 0:
                return []
            return json.load(f)

    def _write_json(self, path: Path, data: object) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = path.with_suffix(f".{uuid4().hex}.tmp")
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        tmp_path.replace(path)

    @staticmethod
    def _message_key(sender: str, body: str, received_at: str) -> str:
        raw = f"{sender}|{body}|{received_at}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    @staticmethod
    def _unknown_lead_id(sender: str) -> str:
        return "unknown_whatsapp_" + hashlib.sha256(sender.encode("utf-8")).hexdigest()[:12]
