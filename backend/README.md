# Backend

FastAPI application serving all LeadGenie AI endpoints. Entry point: `main.py`.

Run from this directory:
```bash
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Interactive API docs: `http://localhost:8000/docs`

---

## Structure

```
backend/
├── main.py               # All API routes — single file, all endpoints registered here
├── render_whatsapp_mailbox_app.py # Standalone Render mailbox app for Twilio WhatsApp webhooks
├── requirements.txt
├── Dockerfile
│
├── agents/               # AI agents — see agents/README.md
├── governance/           # Safety layer — see governance/README.md
├── services/             # External integrations — see services/README.md
├── learning/             # Feedback collection and pattern analysis
├── scheduling/           # Calendly integration + WhatsApp follow-up scheduler
└── storage/              # Runtime data (gitignored)
    ├── audit_logs/       # Immutable per-lead JSONL audit trail
    ├── conversations/    # Conversation history per lead
    ├── feedback/         # Outcome records
    ├── intent_analytics/ # Intent classification event log
    ├── lead_contexts/    # Email/phone → lead context map for reply matching
    ├── followups/        # Pending WhatsApp fallback jobs
    ├── render_mailbox/   # Local raw WhatsApp mailbox import state
    └── whatsapp_conversations/ # Human-controlled WhatsApp inbox threads
```

---

## How `main.py` works

`main.py` is the only file that registers routes. It:
1. Loads `.env` from the repo root via `python-dotenv`
2. Instantiates all agents and services as module-level singletons
3. Defines every FastAPI route

All service and agent classes are stateless except for file-based persistence in `storage/`. This means the app can be restarted without losing data.

---

## Adding a new endpoint

1. Add your route to `main.py`
2. If it needs a new agent or service, put it in `agents/` or `services/`
3. Add a `Pydantic` model for any POST body
4. Update `frontend/src/lib/api.ts` to expose the new call to the frontend

---

## Learning module

`feedback_collector.py` accepts outcomes: `approved`, `rejected`, `replied`, `objection`, `unsubscribed`, `no_reply`, `meeting_booked`.

`learning_engine.py` reads all feedback and returns pattern analysis via `GET /learning/analytics`.

---

## Scheduling

`scheduler.py` integrates with Calendly API to check availability and list scheduled events. Requires `CALENDLY_API_TOKEN` and `CALENDLY_ORG_URI` in `.env`. Not required for the core conversation flow — the conversation agent sends a Calendly URL directly when it detects `meeting_request` intent.

`followup_scheduler.py` schedules WhatsApp follow-ups after reviewed email outreach is sent. If no email reply is detected before `WHATSAPP_FOLLOWUP_WAIT_MINUTES`, it sends a short WhatsApp fallback and stores the outbound message in the WhatsApp conversation store.

Run the worker from the repo root:
```bash
python3 scripts/run_followup_scheduler.py
```

Manual processing is also available through `POST /followups/process-due`.

---

## WhatsApp Mailbox

`main.py` exposes the local human-controlled WhatsApp inbox:
- `GET /whatsapp/conversations` imports remote pending messages and returns awaiting-human conversations
- `POST /whatsapp/conversations/{lead_id}/open` clears the unread flag
- `POST /whatsapp/reply` sends a human-authored WhatsApp reply
- `GET /whatsapp/debug` shows remote/local mailbox sync details

For a standalone hosted Twilio webhook, deploy `render_whatsapp_mailbox_app.py` with:
```bash
uvicorn render_whatsapp_mailbox_app:app --host 0.0.0.0 --port $PORT
```

The hosted app accepts inbound Twilio payloads at `POST /whatsapp`, stores them in a Render-safe mailbox path, and exposes raw pending messages at `GET /pending-messages`.
