import email
import imaplib
import logging
import os
import time
from datetime import datetime, timezone
from email.header import decode_header
from email.utils import parseaddr

from agents.conversation.conversation_agent import ConversationAgent
from scheduling.followup_scheduler import FollowupScheduler
from services.lead_context_store import LeadContextStore

logger = logging.getLogger(__name__)

POLL_INTERVAL = int(os.getenv("REPLY_POLL_INTERVAL", "60"))


class GmailReplyPoller:
    """Polls Gmail inbox for replies to LeadGenie outreach emails."""

    def __init__(self):
        self.user = os.getenv("LEADGENIE_GMAIL", "")
        self.password = os.getenv("LEADGENIE_GMAIL_PASSWORD", "")
        self.store = LeadContextStore()
        self.agent = ConversationAgent()
        self.followups = FollowupScheduler()

    def _connect(self) -> imaplib.IMAP4_SSL:
        mail = imaplib.IMAP4_SSL("imap.gmail.com", 993)
        mail.login(self.user, self.password)
        return mail

    def _decode_header_value(self, value: str) -> str:
        parts = decode_header(value)
        decoded = []
        for part, enc in parts:
            if isinstance(part, bytes):
                decoded.append(part.decode(enc or "utf-8", errors="replace"))
            else:
                decoded.append(part)
        return " ".join(decoded)

    def _extract_body(self, msg: email.message.Message) -> str:
        """Extract plain-text body, stripping quoted history."""
        body = ""
        if msg.is_multipart():
            for part in msg.walk():
                if part.get_content_type() == "text/plain":
                    body = part.get_payload(decode=True).decode("utf-8", errors="replace")
                    break
        else:
            body = msg.get_payload(decode=True).decode("utf-8", errors="replace")

        lines = [line for line in body.splitlines() if not line.strip().startswith(">")]
        return "\n".join(lines).strip()

    def _known_lead_emails(self) -> list[str]:
        """Return all email addresses that have stored contexts."""
        return self.store.list_lead_emails()

    def _fetch_unseen(self, mail: imaplib.IMAP4_SSL) -> list[dict]:
        mail.select("INBOX")

        known = self._known_lead_emails()
        if not known:
            logger.info("No stored lead emails found; skipping Gmail search")
            return []

        logger.info("Searching Gmail for unseen replies from %s known lead email(s)", len(known))

        msg_id_set = set()
        for lead_email in known:
            status, data = mail.search(None, f'UNSEEN FROM "{lead_email}"')
            matched = len(data[0].split()) if data and data[0] else 0
            logger.info(
                "Gmail search lead_email=%s status=%s matched=%s",
                lead_email,
                status,
                matched,
            )
            if data and data[0]:
                for mid in data[0].split():
                    msg_id_set.add(mid)

        messages = []
        for mid in msg_id_set:
            _, raw = mail.fetch(mid, "(RFC822)")
            msg = email.message_from_bytes(raw[0][1])
            sender = self._decode_header_value(msg.get("From", ""))
            subject = self._decode_header_value(msg.get("Subject", ""))
            body = self._extract_body(msg)
            sender_email = parseaddr(sender)[1].strip().lower()

            logger.info(
                "Detected Gmail reply msg_id=%s from=%s parsed_email=%s subject=%r body_len=%s",
                mid.decode(errors="replace") if isinstance(mid, bytes) else mid,
                sender,
                sender_email,
                subject,
                len(body or ""),
            )

            messages.append({
                "id": mid,
                "from": sender_email,
                "subject": subject,
                "body": body,
            })
        return messages

    def _mark_seen(self, mail: imaplib.IMAP4_SSL, msg_id: bytes) -> None:
        mail.store(msg_id, "+FLAGS", "\\Seen")

    def process_once(self) -> list[dict]:
        """Fetch unseen replies, process each, return results."""
        logger.info("Starting Gmail reply poll user=%s", self.user)
        mail = self._connect()
        try:
            messages = self._fetch_unseen(mail)
            results = []

            for msg in messages:
                sender_email = msg["from"]
                body = msg["body"]

                if not body:
                    logger.info("Skipping empty reply from %s", sender_email)
                    self._mark_seen(mail, msg["id"])
                    continue

                stored = self.store.get_by_email(sender_email)
                if not stored:
                    logger.info("Reply from unknown lead: %s - skipping", sender_email)
                    continue

                lead_id = stored["lead_id"]
                context = stored["context"]
                logger.info("Resolved Gmail reply sender=%s lead_id=%s", sender_email, lead_id)
                before_followup = self.followups.get(lead_id)
                logger.info(
                    "Before mark_replied lead_id=%s followup_status=%s due_at=%s",
                    lead_id,
                    before_followup.get("status") if before_followup else None,
                    before_followup.get("due_at") if before_followup else None,
                )
                marked = self.followups.mark_replied(lead_id)
                after_followup = self.followups.get(lead_id)
                logger.info(
                    "After mark_replied lead_id=%s changed=%s followup_status=%s replied_at=%s",
                    lead_id,
                    marked,
                    after_followup.get("status") if after_followup else None,
                    after_followup.get("replied_at") if after_followup else None,
                )

                logger.info("Processing reply from %s (lead_id=%s)", sender_email, lead_id)
                result = self.agent.handle_reply(
                    lead_id=lead_id,
                    reply=body,
                    context=context,
                    lead_email=sender_email,
                )

                self._mark_seen(mail, msg["id"])
                results.append({
                    "lead_email": sender_email,
                    "lead_id": lead_id,
                    "intent": result.get("intent"),
                    "intent_confidence": result.get("intent_confidence"),
                    "response_sent": result.get("email_sent", False),
                    "followup_marked_replied": marked,
                })
                logger.info(
                    "Replied to %s - intent=%s email_sent=%s followup_marked_replied=%s",
                    sender_email,
                    result.get("intent"),
                    result.get("email_sent"),
                    marked,
                )

            return results
        finally:
            mail.logout()

    def run_forever(self) -> None:
        """Poll continuously. Run this in a background thread or separate process."""
        logger.info("Gmail reply poller started - checking every %ds", POLL_INTERVAL)
        while True:
            try:
                results = self.process_once()
                if results:
                    for result in results:
                        confidence = result.get("intent_confidence")
                        confidence_text = f"{confidence:.2f}" if confidence is not None else "n/a"
                        print(
                            f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] "
                            f"{result['lead_email']} -> intent={result['intent']} "
                            f"(conf={confidence_text}) "
                            f"reply_sent={result['response_sent']} "
                            f"followup_replied={result['followup_marked_replied']}"
                        )
                else:
                    print(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] No new replies")
            except Exception:
                logger.exception("Poller error")
            time.sleep(POLL_INTERVAL)
