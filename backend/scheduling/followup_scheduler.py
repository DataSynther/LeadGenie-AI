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
from governance.outreach_queue_store import OutreachQueueStore
from governance.risk_engine import RiskEngine
from services.twilio_whatsapp import TwilioWhatsApp
from services.whatsapp_conversation_store import WhatsAppConversationStore

logger = logging.getLogger(__name__)

STORE_DIR = Path(__file__).parent.parent / "storage" / "followups"
STORE_DIR.mkdir(parents=True, exist_ok=True)
WHATSAPP_SENDER_INTRO = "I am Prasant from Ganit."


class FollowupScheduler:
    """Schedules WhatsApp fallbacks when email outreach gets no reply."""

    def schedule_followup(
        self,
        lead_id: str,
        phone: str,
        context: dict,
        outreach: Optional[dict] = None,
        wait_minutes: Optional[int] = None,
        max_followups: int = 1,
    ) -> dict:
        wait = wait_minutes or int(os.getenv("WHATSAPP_FOLLOWUP_WAIT_MINUTES", "2"))
        now = datetime.utcnow()
        max_followups = max(0, min(int(max_followups or 0), 5))
        record = {
            "lead_id": lead_id,
            "phone": phone,
            "context": context,
            "outreach": outreach or context.get("outreach") or {},
            "max_followups": max_followups,
            "next_followup_number": 2 if max_followups >= 2 else None,
            "email_followups": [],
            "pending_followup_event_id": None,
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
        record["pending_followup_event_id"] = None
        for item in record.get("email_followups") or []:
            if item.get("status") == "pending_approval":
                item["status"] = "cancelled"
                item["cancelled_at"] = record["replied_at"]
        self._write(lead_id, record)
        cancelled = OutreachQueueStore().cancel_pending_followups(lead_id)
        if cancelled:
            logger.info("Cancelled %s pending email follow-up approvals for replied lead_id=%s", cancelled, lead_id)
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

            if not record.get("phone"):
                queued = self.queue_next_email_followup(lead_id)
                results.append({"lead_id": lead_id, "sent": False, "followup_queued": bool(queued), "event_id": queued})
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
                event_id = self.queue_next_email_followup(lead_id)
                if event_id:
                    result["followup_queued"] = True
                    result["followup_event_id"] = event_id
            results.append({"lead_id": lead_id, **result})
        return results

    def schedule_next_after_email_followup(self, lead_id: str, sent_followup_number: int, wait_minutes: Optional[int] = None) -> Optional[dict]:
        record = self.get(lead_id)
        if not record or record.get("status") == "replied":
            return None
        max_followups = int(record.get("max_followups") or 0)
        next_number = int(sent_followup_number or 0) + 1
        if next_number > max_followups or next_number > 5:
            record["status"] = "completed"
            record["completed_at"] = datetime.utcnow().isoformat()
            record["next_followup_number"] = None
            self._write(lead_id, record)
            return record

        wait = wait_minutes or int(os.getenv("EMAIL_FOLLOWUP_WAIT_MINUTES", os.getenv("WHATSAPP_FOLLOWUP_WAIT_MINUTES", "2")))
        record["status"] = "waiting"
        record["due_at"] = (datetime.utcnow() + timedelta(minutes=wait)).isoformat()
        record["next_followup_number"] = next_number
        record["pending_followup_event_id"] = None
        self._write(lead_id, record)
        return record

    def queue_next_email_followup(self, lead_id: str) -> Optional[str]:
        record = self.get(lead_id)
        if not record or record.get("status") == "replied":
            return None

        followup_number = record.get("next_followup_number")
        max_followups = int(record.get("max_followups") or 0)
        if not followup_number or int(followup_number) > max_followups or int(followup_number) > 5:
            record["status"] = "completed"
            record["completed_at"] = datetime.utcnow().isoformat()
            self._write(lead_id, record)
            return None

        if record.get("pending_followup_event_id"):
            return record.get("pending_followup_event_id")

        context = record.get("context") or {}
        lead = context.get("lead") or {}
        company = context.get("company") or {}
        lead_email = lead.get("email") or record.get("lead_email")
        if not lead_email:
            logger.warning("Cannot queue follow-up without lead email lead_id=%s", lead_id)
            return None

        email = self._build_email_followup(record, int(followup_number))
        governance, attempt_history = self._validate_email(lead_id, email, context)
        event_id = OutreachQueueStore().enqueue(
            lead_id=lead_id,
            lead_name=lead.get("name", ""),
            lead_title=lead.get("title", ""),
            company_name=company.get("name", ""),
            lead_email=lead_email,
            lead_phone=record.get("phone", ""),
            email=email,
            governance=governance,
            attempt_history=attempt_history,
            grounding_facts={},
            context=context,
            message_type="followup",
            followup_number=int(followup_number),
        )

        email_followups = record.get("email_followups") or []
        email_followups.append({
            "followup_number": int(followup_number),
            "event_id": event_id,
            "queued_at": datetime.utcnow().isoformat(),
            "status": "pending_approval",
            "subject": email.get("subject", ""),
            "body": email.get("body", ""),
        })
        record["email_followups"] = email_followups
        record["pending_followup_event_id"] = event_id
        record["status"] = "email_followup_pending_approval"
        self._write(lead_id, record)
        return event_id

    def mark_followup_sent(self, lead_id: str, event_id: str, followup_number: int, email: Optional[dict] = None) -> None:
        record = self.get(lead_id)
        if not record:
            return
        for item in record.get("email_followups") or []:
            if item.get("event_id") == event_id:
                item["status"] = "sent"
                item["sent_at"] = datetime.utcnow().isoformat()
                if email:
                    item["subject"] = email.get("subject", item.get("subject", ""))
                    item["body"] = email.get("body", item.get("body", ""))
                    item["reasoning"] = email.get("reasoning", item.get("reasoning", ""))
        record["pending_followup_event_id"] = None
        self._write(lead_id, record)
        self.schedule_next_after_email_followup(lead_id, followup_number)

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
            return self._with_sender_intro(message, lead)
        except Exception:
            logger.exception(
                "Personalized WhatsApp generation failed lead_id=%s; using contextual fallback",
                record.get("lead_id"),
            )
            return self._with_sender_intro(self._build_fallback_message(lead, company, outreach), lead)

    def _with_sender_intro(self, message: str, lead: dict) -> str:
        name = (lead.get("name") or "there").strip().split()[0] or "there"
        intro = f"Hi {name}, {WHATSAPP_SENDER_INTRO}"
        trimmed = (message or "").strip()
        if trimmed.startswith(intro):
            return trimmed
        for greeting in (f"Hi {name},", f"Hello {name},", "Hi there,", "Hello there,"):
            if trimmed.lower().startswith(greeting.lower()):
                trimmed = trimmed[len(greeting):].strip()
                break
        return f"{intro}\n\n{trimmed}" if trimmed else intro

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

    def _build_email_followup(self, record: dict, followup_number: int) -> dict:
        context = record.get("context") or {}
        lead = context.get("lead") or {}
        company = context.get("company") or {}
        outreach = record.get("outreach") or context.get("outreach") or {}
        first_name = (lead.get("name") or "there").split()[0]
        company_name = company.get("name") or "your team"
        subject = outreach.get("subject") or f"{company_name} follow-up"
        prior_subject = subject.replace("Re: ", "")
        stage = {
            2: ("Reminder", "I wanted to follow up on my previous email."),
            3: ("Call To Action", "Would you be open to a quick conversation?"),
            4: ("Still Interested", "I am checking whether this is still relevant."),
            5: ("Feedback / Future Interest", "If now is not the right time, would it make sense to reconnect later?"),
        }.get(followup_number, ("Follow-up", "I wanted to follow up."))

        history_bits = []
        if outreach.get("body"):
            history_bits.append("I had shared a note about " + self._short_topic(prior_subject, company_name) + ".")
        if record.get("whatsapp_sent_at"):
            history_bits.append("I also sent a short WhatsApp note in case that was easier.")
        previous_followups = [
            item for item in (record.get("email_followups") or [])
            if item.get("status") == "sent" and int(item.get("followup_number") or 0) < followup_number
        ]
        if previous_followups:
            last = sorted(previous_followups, key=lambda i: i.get("followup_number") or 0)[-1]
            history_bits.append(
                f"My last follow-up was about {self._short_topic(last.get('subject', ''), company_name)}."
            )

        body = (
            f"Hi {first_name},\n\n"
            f"{stage[1]} "
            f"{' '.join(history_bits)} "
            f"Given {company_name}'s context, I thought this may still be worth a brief look.\n\n"
            "With regards,\nGanit team"
        )
        return {
            "subject": f"Re: {prior_subject}"[:60],
            "body": body,
            "reasoning": f"Follow-up #{followup_number} ({stage[0]}) generated from prior outreach, WhatsApp status, and lead/company context.",
            "followup_type": stage[0],
        }

    def _validate_email(self, lead_id: str, email: dict, context: dict) -> tuple[dict, list[dict]]:
        lead = context.get("lead") or {}
        company = context.get("company") or {}
        source_facts = {
            "company_name": company.get("name"),
            "industry": company.get("industry"),
            "lead_title": lead.get("title"),
            "description": company.get("description"),
            "employee_count": company.get("employee_count"),
            "technologies": company.get("technologies", []),
        }
        risk_engine = RiskEngine()
        governance = risk_engine.evaluate(lead_id, email, source_facts)
        tone = risk_engine.tone_validator.validate(email)
        hallucination = risk_engine.hallucination_checker.check(email, source_facts, lead_id=lead_id)
        attempt_history = [{
            "attempt": 1,
            "passed": governance.get("approved", False),
            "email": {
                "subject": email.get("subject", ""),
                "body": email.get("body", ""),
                "reasoning": email.get("reasoning", ""),
            },
            "layers": {
                "tone": tone,
                "hallucination": {
                    "passed": hallucination.get("passed", True),
                    "violations": hallucination.get("violations", []),
                    "confidence": hallucination.get("confidence"),
                    "explanation": hallucination.get("explanation", ""),
                },
                "validator": {"consequence": "allow", "issues": [], "checkpoints": {}},
            },
        }]
        governance["total_attempts"] = 1
        return governance, attempt_history

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
