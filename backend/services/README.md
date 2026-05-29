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
