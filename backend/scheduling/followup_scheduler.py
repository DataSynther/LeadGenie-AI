import json
import logging
import os
import sys
import time
import traceback
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from agents.outreach.outreach_agent import OutreachAgent
from agents.conversation.memory_manager import MemoryManager
from services.twilio_whatsapp import TwilioWhatsApp
from services.whatsapp_conversation_store import WhatsAppConversationStore

logger = logging.getLogger(__name__)

STORE_DIR = Path(__file__).parent.parent / "storage" / "followups"
STORE_DIR.mkdir(parents=True, exist_ok=True)


class FollowupScheduler:
    """Schedules WhatsApp fallbacks when email outreach gets no reply."""

    def schedule_followup(
        self,
        lead_id: str,
        phone: str,
        context: dict,
        outreach: Optional[dict] = None,
        wait_minutes: Optional[int] = None,
    ) -> dict:
        wait = wait_minutes or int(os.getenv("WHATSAPP_FOLLOWUP_WAIT_MINUTES", "2"))
        now = datetime.utcnow()
        record = {
            "lead_id": lead_id,
            "phone": phone,
            "context": context,
            "outreach": outreach or context.get("outreach") or {},
            "email_sent_at": now.isoformat(),
            "due_at": (now + timedelta(minutes=wait)).isoformat(),
            "status": "waiting",
            "whatsapp_sent_at": None,
            "whatsapp_error": None,
        }
        self._write(lead_id, record)
        return record

    def mark_replied(self, lead_id: str) -> bool:
        path = self._path(lead_id)
        logger.info("mark_replied requested lead_id=%s path=%s", lead_id, path)
        record = self.get(lead_id)
        if not record:
            logger.info("mark_replied skipped; no follow-up record lead_id=%s path=%s", lead_id, path)
            return False
        old_status = record.get("status")
        logger.info(
            "mark_replied before update lead_id=%s old_status=%s due_at=%s whatsapp_sent_at=%s",
            lead_id,
            old_status,
            record.get("due_at"),
            record.get("whatsapp_sent_at"),
        )
        record["status"] = "replied"
        record["replied_at"] = datetime.utcnow().isoformat()
        self._write(lead_id, record)
        updated = self.get(lead_id) or {}
        logger.info(
            "mark_replied after update lead_id=%s old_status=%s current_status=%s replied_at=%s path=%s",
            lead_id,
            old_status,
            updated.get("status"),
            updated.get("replied_at"),
            path,
        )
        logger.info(
            "Follow-up status updated lead_id=%s old_status=%s new_status=%s",
            lead_id,
            old_status,
            updated.get("status"),
        )
        return updated.get("status") == "replied" and old_status != "replied"

    def has_reply(self, lead_id: str) -> bool:
        record = self.get(lead_id)
        return bool(record and record.get("status") == "replied")

    def get(self, lead_id: str) -> Optional[dict]:
        path = self._path(lead_id)
        if not path.exists():
            return None
        with open(path) as f:
            return json.load(f)

    def get_by_phone(self, phone: str) -> Optional[dict]:
        normalized = self._normalize_phone(phone)
        for path in STORE_DIR.glob("*.json"):
            with open(path) as f:
                record = json.load(f)
            if self._normalize_phone(record.get("phone", "")) == normalized:
                return record
        return None

    def process_due(self) -> list[dict]:
        now = datetime.utcnow()
        results = []
        for path in STORE_DIR.glob("*.json"):
            with open(path) as f:
                record = json.load(f)

            logger.info(
                "Scheduler inspecting follow-up path=%s lead_id=%s status=%s due_at=%s now=%s",
                path,
                record.get("lead_id"),
                record.get("status"),
                record.get("due_at"),
                now.isoformat(),
            )
            if record.get("status") != "waiting":
                logger.info(
                    "Skipping follow-up lead_id=%s status=%s",
                    record.get("lead_id"),
                    record.get("status"),
                )
                continue
            if datetime.fromisoformat(record["due_at"]) > now:
                continue

            lead_id = record["lead_id"]
            if self.has_reply(lead_id):
                logger.info("Skipping due follow-up lead_id=%s because status is replied", lead_id)
                record["status"] = "replied"
                self._write(lead_id, record)
                continue

            message = self._build_message(record)
            latest_record = self.get(lead_id) or {}
            latest_status = latest_record.get("status")
            if latest_status != "waiting":
                logger.info(
                    "Skipping WhatsApp send after re-read lead_id=%s latest_status=%s",
                    lead_id,
                    latest_status,
                )
                continue

            phone = record.get("phone")
            request_started_at = datetime.utcnow().isoformat()
            logger.info(
                "Processing due WhatsApp follow-up lead_id=%s phone=%r "
                "message=%r request_started_at=%s python=%s cwd=%s twilio_module=%s",
                lead_id,
                phone,
                message,
                request_started_at,
                sys.executable,
                os.getcwd(),
                sys.modules[TwilioWhatsApp.__module__].__file__,
            )

            call_started = time.monotonic()
            try:
                result = TwilioWhatsApp().send(phone, message)
            except Exception as exc:
                result = {
                    "sent": False,
                    "to": phone,
                    "error": str(exc),
                    "traceback": traceback.format_exc(),
                }
                logger.exception("Unexpected scheduler WhatsApp exception lead_id=%s", lead_id)

            logger.info(
                "Processed due WhatsApp follow-up lead_id=%s sent=%s "
                "status_code=%s elapsed=%ss service_elapsed=%s error=%r",
                lead_id,
                result.get("sent"),
                result.get("status_code"),
                round(time.monotonic() - call_started, 3),
                result.get("elapsed_seconds"),
                result.get("error"),
            )
            record["whatsapp_sent_at"] = datetime.utcnow().isoformat()
            record["whatsapp_error"] = result.get("error")
            record["whatsapp_traceback"] = result.get("traceback")
            record["whatsapp_status_code"] = result.get("status_code")
            record["whatsapp_elapsed_seconds"] = result.get("elapsed_seconds")
            record["whatsapp_normalized_to"] = result.get("normalized_to")
            record["status"] = "whatsapp_sent" if result.get("sent") else "failed"
            self._write(lead_id, record)
            if result.get("sent"):
                try:
                    MemoryManager().store_message(
                        lead_id,
                        "sdr",
                        message,
                        channel="whatsapp",
                        direction="outbound",
                    )
                except Exception:
                    logger.exception("Unable to store WhatsApp follow-up in memory lead_id=%s", lead_id)
                try:
                    WhatsAppConversationStore().add_message(
                        lead_id=lead_id,
                        context=record.get("context", {}),
                        direction="outbound",
                        message=message,
                        phone=phone,
                    )
                except Exception:
                    logger.exception("Unable to store WhatsApp follow-up conversation lead_id=%s", lead_id)
            results.append({"lead_id": lead_id, **result})
        return results

    def _build_message(self, record: dict) -> str:
        context = record.get("context", {})
        lead = context.get("lead", {})
        company = context.get("company", {})
        outreach = record.get("outreach") or context.get("outreach") or {}

        try:
            message = OutreachAgent().generate_whatsapp_followup(
                context=context,
                outreach=outreach,
            )
            logger.info(
                "Generated personalized WhatsApp follow-up lead_id=%s message=%r",
                record.get("lead_id"),
                message,
            )
            return message
        except Exception:
            logger.exception(
                "Personalized WhatsApp generation failed lead_id=%s; using contextual fallback",
                record.get("lead_id"),
            )
            return self._build_fallback_message(lead, company, outreach)

    def _build_fallback_message(self, lead: dict, company: dict, outreach: dict) -> str:
        name = (lead.get("name") or "there").split()[0]
        company_name = company.get("name") or "your team"
        subject = outreach.get("subject") or ""
        topic = self._short_topic(subject, company_name)
        return (
            f"Hi {name}, I reached out earlier about {topic} for {company_name}. "
            "Thought I would follow up here in case WhatsApp is easier. "
            "Would a quick 15-minute chat next week be useful?"
        )

    @staticmethod
    def _short_topic(subject: str, company_name: str) -> str:
        cleaned = (subject or "").strip().rstrip(".")
        if not cleaned:
            return "a few practical ideas"
        cleaned = cleaned.replace(company_name, "").strip(" -:|")
        words = cleaned.split()
        return " ".join(words[:8]) if words else "a few practical ideas"

    def _write(self, lead_id: str, record: dict) -> None:
        with open(self._path(lead_id), "w") as f:
            json.dump(record, f, indent=2)

    def _path(self, lead_id: str) -> Path:
        return STORE_DIR / f"{lead_id}.json"

    @staticmethod
    def _normalize_phone(phone: str) -> str:
        normalized = (phone or "").replace(" ", "").strip()
        if normalized.lower().startswith("whatsapp:"):
            normalized = normalized.split(":", 1)[1]
        return normalized
