import imaplib
import email
import os
import time
import logging
from email.header import decode_header
from datetime import datetime, timezone

from services.lead_context_store import LeadContextStore
from agents.conversation.conversation_agent import ConversationAgent
from scheduling.followup_scheduler import FollowupScheduler

logger = logging.getLogger(__name__)

POLL_INTERVAL = int(os.getenv("REPLY_POLL_INTERVAL", "60"))  # seconds


class GmailReplyPoller:
    """Polls Gmail inbox for replies to LeadGenie outreach emails.

    Matches the sender's email address against stored lead contexts,
    then calls ConversationAgent.handle_reply() and sends a response back.
    """

    def __init__(self):
        self.user     = os.getenv("LEADGENIE_GMAIL", "")
        self.password = os.getenv("LEADGENIE_GMAIL_PASSWORD", "")
        self.store    = LeadContextStore()
        self.agent    = ConversationAgent()

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

        # Strip quoted reply history (lines starting with ">")
        lines = [l for l in body.splitlines() if not l.strip().startswith(">")]
        return "\n".join(lines).strip()

    def _known_lead_emails(self) -> list[str]:
        """Return all email addresses that have stored contexts."""
        import os
        from pathlib import Path
        store_dir = Path(__file__).parent.parent / "storage" / "lead_contexts"
        if not store_dir.exists():
            return []
        emails = []
        for f in store_dir.glob("*.json"):
            key = f.stem  # e.g. vickyiter_at_gmail_com
            addr = key.replace("_at_", "@").replace("_", ".")
            emails.append(addr)
        return emails

    def _fetch_unseen(self, mail: imaplib.IMAP4_SSL) -> list[dict]:
        mail.select("INBOX")

        known = self._known_lead_emails()
        if not known:
            return []

        # Search IMAP for UNSEEN reply emails (Re:) FROM known leads only
        msg_id_set = set()
        for lead_email in known:
            _, data = mail.search(None, f'UNSEEN FROM "{lead_email}" SUBJECT "Re:"')
            if data[0]:
                for mid in data[0].split():
                    msg_id_set.add(mid)

        messages = []
        for mid in msg_id_set:
            _, raw = mail.fetch(mid, "(RFC822)")
            msg = email.message_from_bytes(raw[0][1])
            sender = self._decode_header_value(msg.get("From", ""))
            subject = self._decode_header_value(msg.get("Subject", ""))
            body = self._extract_body(msg)

            sender_email = sender
            if "<" in sender and ">" in sender:
                sender_email = sender.split("<")[1].rstrip(">").strip()

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
        mail = self._connect()
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
                logger.info("Reply from unknown lead: %s — skipping", sender_email)
                # Don't mark as seen — may need manual review
                continue

            lead_id = stored["lead_id"]
            context = stored["context"]
            FollowupScheduler().mark_replied(lead_id)

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
            })
            logger.info(
                "Replied to %s — intent=%s email_sent=%s",
                sender_email, result.get("intent"), result.get("email_sent"),
            )

        mail.logout()
        return results

    def run_forever(self) -> None:
        """Poll continuously. Run this in a background thread or separate process."""
        logger.info("Gmail reply poller started — checking every %ds", POLL_INTERVAL)
        while True:
            try:
                results = self.process_once()
                if results:
                    for r in results:
                        print(
                            f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] "
                            f"{r['lead_email']} → intent={r['intent']} "
                            f"(conf={r['intent_confidence']:.2f}) "
                            f"reply_sent={r['response_sent']}"
                        )
                else:
                    print(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] No new replies")
            except Exception as e:
                logger.error("Poller error: %s", e)
            time.sleep(POLL_INTERVAL)
