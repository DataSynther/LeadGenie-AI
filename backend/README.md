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
├── requirements.txt
├── Dockerfile
│
├── agents/               # AI agents — see agents/README.md
├── governance/           # Safety layer — see governance/README.md
├── observability/        # Diagnostic tracing layer — see observability/README.md
│   ├── diagnostic_store.py   # JSONL persistence + query helpers
│   ├── agent_tracer.py       # Context manager wrapping every Claude call
│   └── validator.py          # Output validation: shape/context/policy → allow/block/defer
├── services/             # External integrations — see services/README.md
├── learning/             # Feedback collection and pattern analysis
├── scheduling/           # Calendly integration
└── storage/              # Runtime data (gitignored)
    ├── audit_logs/       # Immutable per-lead JSONL audit trail
    ├── conversations/    # Conversation history per lead
    ├── diagnostics/      # Agent traces + validation events (observability layer)
    ├── feedback/         # Outcome records
    ├── intent_analytics/ # Intent classification event log
    └── lead_contexts/    # Email → lead context map for reply matching
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

## Observability module

`observability/` is the diagnostic instrumentation layer for Phase 1 of the Governed AI Platform. It wraps every Claude call automatically without changing agent business logic.

**Three components:**
- `diagnostic_store.py` — append-only JSONL store + query helpers for the `/dev/*` endpoints
- `agent_tracer.py` — context manager measuring latency, context completeness, prompt ambiguity, and diagnostic categories
- `validator.py` — validates every agent output (shape → context → policy → business rules) with `allow / block / defer` consequences

**Dev endpoints (all registered in `main.py`):**

| Endpoint | Data |
|---|---|
| `GET /dev/diagnostics` | 5-category hallucination breakdown with counts and recent events |
| `GET /dev/agent-metrics` | Per-agent success rate, latency, tokens, confidence, validation pass rate |
| `GET /dev/traces` | Recent raw call traces with all diagnostic metadata |
| `GET /dev/validation-log` | Recent validation outcomes with issue details |

See `observability/README.md` for full documentation including how to add new agents, new categories, and how to wire observability into new features.

---

## Learning module

`feedback_collector.py` accepts outcomes: `approved`, `rejected`, `replied`, `objection`, `unsubscribed`, `no_reply`, `meeting_booked`.

`learning_engine.py` reads all feedback and returns pattern analysis via `GET /learning/analytics`.

---

## Scheduling

`scheduler.py` integrates with Calendly API to check availability and list scheduled events. Requires `CALENDLY_API_TOKEN` and `CALENDLY_ORG_URI` in `.env`. Not required for the core conversation flow — the conversation agent sends a Calendly URL directly when it detects `meeting_request` intent.
