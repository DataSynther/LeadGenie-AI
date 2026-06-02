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

The store also supports phone lookup with `get_by_phone(phone)`, so WhatsApp follow-ups and inbound WhatsApp replies can resolve back to the same saved lead context.

---

## twilio_whatsapp.py

Sends WhatsApp messages through the hosted Render/Twilio mailbox service. This lets the local backend call a single HTTP endpoint while Twilio credentials stay on the hosted service.

Hosted mailbox environment:
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM` (optional, defaults to the Twilio sandbox sender)

Local backend environment:
- `WHATSAPP_API_URL` - defaults to the hosted `/send-whatsapp` endpoint
- `WHATSAPP_REQUEST_TIMEOUT_SECONDS` - defaults to `90`

```python
TwilioWhatsApp().send(
    phone="+919999999999",
    message="Thought I would follow up here in case WhatsApp is easier.",
)
# Returns: { sent: True/False, to: "...", status_code: 200, error: None/"..." }
```

---

## render_whatsapp_mailbox.py

Imports inbound WhatsApp replies from the hosted Render mailbox into the local LeadGenie inbox.

How it works:
1. Fetches raw messages from `WHATSAPP_PENDING_MESSAGES_URL`
2. Deduplicates imported messages in `processed_message_keys.json`
3. Resolves sender phone to a scheduled follow-up or saved lead context
4. Stores the reply in `WhatsAppConversationStore`
5. Captures unknown senders as `Unknown WhatsApp Lead`

Environment:
- `WHATSAPP_PENDING_MESSAGES_URL` - defaults to the hosted `/pending-messages` endpoint
- `WHATSAPP_PENDING_REQUEST_TIMEOUT_SECONDS` - defaults to `20`
- `WHATSAPP_LOCAL_MAILBOX_DIR` - optional local raw mailbox storage override

`GET /whatsapp/debug` exposes remote mailbox status, local mailbox count, unread count, and storage paths.

---

## whatsapp_conversation_store.py

File-based store for human-controlled WhatsApp conversations.

Inbound messages are marked:
- `status: "awaiting_human"`
- `unread: true`

Opening a conversation clears the unread flag. Sending a human reply appends an outbound message and moves the conversation out of the awaiting-human state.

Persists to `backend/storage/whatsapp_conversations/{lead_id}.json`.
