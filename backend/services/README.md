# Services

External integration layer. Each service wraps one external API or system. They handle auth, retries, and data normalization — agents should never call external APIs directly.

---

## apollo/

Wraps the [Apollo.io](https://apollo.io) API. Requires `APOLLO_API_KEY` in `.env`.

**`apollo_people.py`** — Lead search and person enrichment.
- `search_people(params)` — searches by `titles`, `seniorities`, `company_names`, `per_page`. Returns normalized list of `{id, name, title, company, seniority, email, linkedin_url}`.
- `get_person_details(lead_id)` — fetches full person record by Apollo ID.

**`apollo_company.py`** — Company data enrichment.
- `enrich_company(domain)` — returns `{name, industry, employee_count, technologies, headcount_growth_12m, headcount_growth_6m, ...}` for a given domain.

**`apollo_signals.py`** — Derives hiring and growth signals from company enrichment data. Works on Apollo free plan (does not use the job postings API which requires a paid plan).

---

## email_sender.py

Sends outreach emails via Gmail SMTP. Requires `LEADGENIE_GMAIL` and `LEADGENIE_GMAIL_PASSWORD` in `.env`.

```python
EmailSender().send(
    to_email="lead@company.com",
    subject="Re: Your growth at Acme",
    body="...",
)
# Returns: { sent: True/False, to: "...", error: None/"..." }
```

Uses `smtplib.SMTP_SSL` on port 465 (`smtp.gmail.com`). The Gmail account must have a valid App Password (not the account login password). Generate one at: Google Account → Security → 2-Step Verification → App Passwords.

Replies to the sent email come back to `LEADGENIE_GMAIL` and are picked up by the reply poller.

---

## gmail_reply_poller.py

Watches the `LEADGENIE_GMAIL` inbox via IMAP for replies from known leads.

**How it works:**
1. Reads all known lead emails from `backend/storage/lead_contexts/`
2. For each known email, searches inbox: `UNSEEN FROM "{lead_email}" SUBJECT "Re:"`
3. On match: fetches email body → looks up lead context → calls `ConversationAgent.handle_reply()` → marks email as seen

```bash
# Run the poller
python3 scripts/run_reply_poller.py

# Manual single-cycle trigger
python3 scripts/process_reply_now.py
```

Poll interval is controlled by `REPLY_POLL_INTERVAL` env var (default: 60 seconds).

---

## lead_context_store.py

File-based key-value store mapping sender email addresses to lead IDs and their context dicts.

The reply poller uses this to match an inbound email `From:` address back to a specific lead and their full context (company, research, signals) — so the conversation agent can generate a grounded response without re-fetching everything.

```python
store = LeadContextStore()

# Save when outreach is sent
store.save("lead@company.com", lead_id="abc123", context={...})

# Retrieve when reply comes in
stored = store.get_by_email("lead@company.com")
# Returns: { lead_id: "abc123", context: {...} } or None
```

Persists to `backend/storage/lead_contexts/{sanitized_email}.json`. Directory is gitignored.

---

## twilio_whatsapp.py

Outbound WhatsApp client used by the follow-up scheduler and human inbox replies.

```python
from services.twilio_whatsapp import TwilioWhatsApp

result = TwilioWhatsApp().send(phone="+919999999999", message="Hi, following up here.")
# Returns: { sent, to, normalized_to, status_code, elapsed_seconds, error }
```

Configuration:
- `WHATSAPP_API_URL` - endpoint that accepts `{phone, message}`. Defaults to the Render `/send-whatsapp` service.
- `WHATSAPP_REQUEST_TIMEOUT_SECONDS` - request timeout, default `90`.

---

## render_whatsapp_mailbox.py

Imports inbound WhatsApp replies from the Render mailbox app into the main backend.

**How it works:**
1. Fetches remote pending messages from `WHATSAPP_PENDING_MESSAGES_URL`
2. Resolves sender phone through `FollowupScheduler.get_by_phone()` or `LeadContextStore.get_by_phone()`
3. Marks the follow-up as replied when a known lead replies
4. Stores the inbound message in `WhatsAppConversationStore`
5. Stores the inbound message in `MemoryManager`
6. Deduplicates imported messages using `backend/storage/render_mailbox/processed_message_keys.json`

Main methods:
- `store_inbound(from_phone, body)` - store a local inbound message
- `import_remote_pending()` - fetch and import remote Render pending messages
- `import_messages(messages)` - import an explicit list of mailbox messages
- `debug_status()` - inspect remote and local mailbox state

Configuration:
- `WHATSAPP_PENDING_MESSAGES_URL` - remote Render `/pending-messages` URL
- `WHATSAPP_PENDING_REQUEST_TIMEOUT_SECONDS` - fetch timeout, default `20`
- `WHATSAPP_LOCAL_MAILBOX_DIR` - local cache directory, default `backend/storage/render_mailbox`

---

## whatsapp_conversation_store.py

File-backed store for the WhatsApp Inbox UI.

Persists to `backend/storage/whatsapp_conversations/` and keys conversations by normalized sender phone, so multiple phone numbers do not collapse into the same lead thread.

Main methods:
- `add_message(lead_id, context, direction, message, phone)` - append inbound/outbound WhatsApp message
- `list_active()` - conversations visible in the inbox
- `get(conversation_id)` - fetch one thread
- `mark_opened(conversation_id)` - clear unread state
- `delete(conversation_id)` - remove a thread

---

## render_whatsapp_mailbox_app.py

This file lives at `backend/render_whatsapp_mailbox_app.py`, but it is part of the WhatsApp service boundary. It is the lightweight Twilio-facing app usually deployed separately on Render.

Endpoints:
- `POST /send-whatsapp` - send outbound WhatsApp through Twilio
- `POST /whatsapp` - receive Twilio inbound WhatsApp webhook payloads
- `GET /pending-messages` - expose queued inbound messages to the main backend importer

Render/Twilio configuration:
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM`, default `whatsapp:+14155238886`
- `WHATSAPP_MAILBOX_DIR`, default `/tmp/leadgenie_whatsapp_mailbox`
