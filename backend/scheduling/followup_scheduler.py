import json
import logging
import os
import sys
import time
import traceback
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import re

from agents.outreach.outreach_agent import OutreachAgent
from agents.conversation.memory_manager import MemoryManager
from agents.outreach.prompt_templates import (
    FOLLOWUP_TRUST_TEMPLATE,
    FOLLOWUP_CTA_TEMPLATE_3,
    FOLLOWUP_CTA_TEMPLATE_5,
)
from memory.sender_kb import SenderKnowledgeBase
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

            # Also suppress if any inbound conversation message exists for this lead
            if self._has_conversation_activity(lead_id):
                logger.info(
                    "Skipping WhatsApp follow-up lead_id=%s — inbound conversation activity detected",
                    lead_id,
                )
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

    # ── Email follow-up generation ─────────────────────────────────────────────
    # Sequence rules:
    #   #2, #4 → trust building via case study (Claude Haiku + KB, no fact repetition)
    #   #3, #5 → call to action (template, no Claude)

    def build_email_followup(self, record: dict, followup_number: int) -> dict:
        """Dispatch to trust or CTA builder based on follow-up number."""
        if followup_number in (2, 4):
            return self._build_trust_email(record, followup_number)
        return self._build_cta_email(record, followup_number)

    def _build_trust_email(self, record: dict, followup_number: int) -> dict:
        """Trust-building email: relevant case study via Claude Haiku.

        Tracks used KB IDs across the sequence so #2 and #4 cite different case studies.
        """
        from anthropic import Anthropic
        context = record.get("context") or {}
        lead    = context.get("lead") or {}
        company = context.get("company") or {}
        research = context.get("research") or {}

        first_name   = (lead.get("name") or "there").split()[0]
        company_name = company.get("name") or "your company"
        industry     = company.get("industry") or ""
        technologies = company.get("technologies") or []
        pain_points  = ", ".join(research.get("pain_points") or []) or "scaling data and AI initiatives"

        outreach    = record.get("outreach") or context.get("outreach") or {}
        prior_subject = outreach.get("subject") or f"{company_name} follow-up"
        prior_hook    = outreach.get("opening_hook") or outreach.get("body") or ""

        # Collect KB IDs used in all previous follow-ups to avoid repetition
        used_kb_ids: set[str] = set()
        for item in (record.get("email_followups") or []):
            for kid in (item.get("kb_ids_used") or []):
                used_kb_ids.add(kid)

        # Pull case studies from KB; exclude already-used IDs
        vertical = self._industry_to_vertical(industry)
        kb_records = SenderKnowledgeBase().retrieve(
            vertical=vertical,
            technologies=technologies,
            category="case_study",
            n=10,
        )
        fresh = [r for r in kb_records if r.get("id") not in used_kb_ids]
        candidates = (fresh or kb_records)[:4]  # fallback to any if all used

        cs_text = "\n".join(
            f"[{r['id']}] {r['claim']}"
            for r in candidates
        )

        prompt = FOLLOWUP_TRUST_TEMPLATE.format(
            first_name=first_name,
            company=company_name,
            industry=industry or "your industry",
            pain_points=pain_points,
            prior_subject=prior_subject,
            prior_hook=prior_hook[:300],
            case_studies=cs_text or "(no case studies available — write a general value-based follow-up)",
        )

        response = Anthropic().messages.create(
            model=os.getenv("CLAUDE_MODEL_FOLLOWUP", "claude-haiku-4-5-20251001"),
            max_tokens=600,
            messages=[{"role": "user", "content": prompt}],
        )
        text = re.sub(r"^```(?:json)?\s*", "", response.content[0].text.strip())
        text = re.sub(r"\s*```$", "", text)
        result = json.loads(text)
        result["followup_type"] = f"trust_building_{followup_number}"
        return result

    def _build_cta_email(self, record: dict, followup_number: int) -> dict:
        """Call-to-action email: template only, no Claude call."""
        context = record.get("context") or {}
        lead    = context.get("lead") or {}
        company = context.get("company") or {}

        first_name   = (lead.get("name") or "there").split()[0]
        company_name = company.get("name") or "your team"
        outreach     = record.get("outreach") or context.get("outreach") or {}
        prior_subject = outreach.get("subject") or f"{company_name} follow-up"

        template = FOLLOWUP_CTA_TEMPLATE_3 if followup_number == 3 else FOLLOWUP_CTA_TEMPLATE_5
        body = template.format(first_name=first_name, company=company_name)

        return {
            "subject": f"Re: {prior_subject}"[:60],
            "body":    body,
            "reasoning": (
                "Soft close — gives the lead a graceful exit while keeping the door open."
                if followup_number == 3
                else "Final close — respectful, no further follow-ups."
            ),
            "followup_type": f"cta_{followup_number}",
            "kb_ids_used": [],
        }

    @staticmethod
    def _industry_to_vertical(industry: str) -> str:
        """Map Apollo industry string to KB vertical."""
        ind = (industry or "").lower()
        if any(k in ind for k in ("fintech", "finance", "banking", "insurance", "lending")):
            return "data_science"
        if any(k in ind for k in ("retail", "ecommerce", "consumer", "fmcg", "cpg")):
            return "data_science"
        if any(k in ind for k in ("manufactur", "semiconductor", "cement", "industrial")):
            return "data_science"
        if any(k in ind for k in ("devops", "infrastructure", "cloud", "platform")):
            return "devops"
        if any(k in ind for k in ("data engineer", "analytics", "warehouse")):
            return "data_engineering"
        return "generic"

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

    def _has_conversation_activity(self, lead_id: str) -> bool:
        """Return True if any inbound message has been received for this lead (email or WhatsApp)."""
        try:
            conv = WhatsAppConversationStore().get_conversation(lead_id)
            if conv:
                inbound = [m for m in conv.get("messages", []) if m.get("direction") == "inbound"]
                if inbound:
                    return True
        except Exception:
            pass
        try:
            from agents.conversation.memory_manager import EpisodicMemory
            history = EpisodicMemory().get(lead_id)
            inbound = [m for m in history if m.get("role") in ("user", "lead")]
            if inbound:
                return True
        except Exception:
            pass
        return False

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
