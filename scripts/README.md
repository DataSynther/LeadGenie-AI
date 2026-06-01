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
