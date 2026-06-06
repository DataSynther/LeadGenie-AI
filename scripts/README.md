# Scripts

Utility scripts for running, debugging, and maintaining the Gmail reply loop. Run from the repo root.

---

## run_reply_poller.py

Starts the Gmail IMAP reply poller as a long-running process. Checks the `LEADGENIE_GMAIL` inbox every `REPLY_POLL_INTERVAL` seconds (default: 60) for replies from known leads.

```bash
python3 scripts/run_reply_poller.py
```

Only processes emails that:
- Are `UNSEEN` (not yet read)
- Are `FROM` a known lead email (present in `backend/storage/lead_contexts/`)
- Have `Re:` in the subject line

---

## process_reply_now.py

Triggers a single poll cycle immediately — useful for testing without waiting for the interval.

```bash
python3 scripts/process_reply_now.py
```

---

## run_followup_scheduler.py

Starts the WhatsApp follow-up scheduler as a standalone long-running process. This is useful when `FOLLOWUP_SCHEDULER_AUTOSTART=false`, when debugging due follow-ups without running the full FastAPI app, or when you want scheduler logs in a separate terminal.

```bash
python scripts/run_followup_scheduler.py
```

What it does:
- Reads due records from `backend/storage/followups/`
- Generates a personalized WhatsApp follow-up through `OutreachAgent.generate_whatsapp_followup()`
- Falls back to the scheduler's contextual message if generation fails
- Sends through `TwilioWhatsApp`
- Stores successful outbound messages in memory and `backend/storage/whatsapp_conversations/`

Environment variables:
- `FOLLOWUP_SCHEDULER_INTERVAL_SECONDS` - loop interval, default `15`
- `FOLLOWUP_SCHEDULER_LOG_LEVEL` - log level, default `INFO`
- `WHATSAPP_FOLLOWUP_WAIT_MINUTES` - delay used when follow-ups are scheduled, default `2`
- `WHATSAPP_API_URL` - outbound WhatsApp endpoint

---

## debug_gmail_poller.py

Connects to Gmail IMAP and prints what the poller sees — number of known leads, which emails match, raw subjects and senders. Use this to diagnose why a reply isn't being picked up.

```bash
python3 scripts/debug_gmail_poller.py
```

---

## test_gmail_imap.py

Verifies IMAP credentials work and the inbox is accessible. Run this first when setting up a new Gmail account.

```bash
python3 scripts/test_gmail_imap.py
```

---

## backfill_lead_contexts.py

Backfills `LeadContextStore` for leads that were sent outreach before the context store existed. Reads from audit logs to reconstruct context.

```bash
python3 scripts/backfill_lead_contexts.py
```
