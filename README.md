# LeadGenie AI — Governed Adaptive AI SDR Platform

> An autonomous, governed, market-aware AI sales development platform that discovers high-intent leads, generates context-personalized outreach, handles multi-turn email conversations, and maintains full auditability — all without human intervention in the loop.

---

## Problem Statement

Existing SDR workflows force teams to choose between slow manual prospecting and ungoverned AI automation — leading to lead decay, weaker engagement, lost sales momentum, and increasing brand risk.

**AI outreach today is fast, but rarely contextual, adaptive, or governed.**

---

## What This System Does

| Capability | Description |
|---|---|
| Lead Intelligence | Fetch and enrich leads via Apollo.io |
| Company Intelligence | Industry, funding, tech stack, headcount growth |
| Signal Intelligence | Hiring trends, AI expansion, scaling signals |
| Trend Intelligence | Market trends, RSS news, curated AI signals |
| Semantic Relevance | Voyage AI embedding-based trend ranking per lead context |
| Adaptive Outreach | Claude-powered personalized email generation |
| Conversation Agent | Intent-aware multi-turn reply handling with memory |
| Intent Detection | Classifies replies: interested / objection / fact_question / neutral / meeting_request / unsubscribe |
| Intent Analytics | Logs every classification to JSONL for pattern analysis |
| Gmail Reply Loop | Sends outreach via Gmail SMTP; IMAP poller catches replies and triggers conversation agent |
| Governance Engine | Tone validation, hallucination checks, risk scoring |
| Audit Lineage | Immutable per-lead JSONL audit trail for all decisions |
| Continuous Learning | Feedback-driven pattern analysis and prompt improvement |
| Meeting Scheduling | Calendly link sent automatically on meeting requests |

---

## End-to-End Flow

```
Apollo (Lead + Company Data)
        │
        ▼
Research Agent ──────────────────── Company context, pain points, AI readiness
        │
        ▼
Context Builder ─────────────────── Unified lead + company + signals object
        │
        ▼
Trend Agent ─────────────────────── RSS + curated market trends
        │
        ▼
Relevance Engine (Voyage AI) ────── Semantic ranking: top 3 trends for this lead
        │
        ▼
Outreach Agent (Claude) ─────────── Personalized cold email with reasoning
        │
        ▼
Governance Layer ────────────────── Tone → Hallucination → Risk score
        │
        ├── risk < 0.4  → Auto-approved → Gmail SMTP sends email
        └── risk ≥ 0.4  → Queued in Approval Queue for human review
                │
                ▼
        Lead replies to email
                │
                ▼
        Gmail IMAP Poller detects reply
                │
                ▼
        Intent Detector (Claude) ───── Classifies: interested / objection / fact_question / neutral / meeting_request / unsubscribe
                │
                ▼
        Conversation Agent (Claude) ── Context-grounded response per intent
                │
                ▼
        Gmail SMTP sends reply back
                │
                ▼
        Intent Analytics logged ─────── events.jsonl for analysis
```

---

## Folder Structure

```
LeadGenie-AI/
├── .env.example                    # Environment variable template (copy → .env)
├── .gitignore
├── docker-compose.yml
├── run_test_pipeline.py            # End-to-end simulation script (6 leads)
│
├── backend/                        # FastAPI backend — see backend/README.md
│   ├── main.py                     # All API routes (single entry point)
│   ├── requirements.txt
│   ├── Dockerfile
│   │
│   ├── agents/                     # AI agent layer — see backend/agents/README.md
│   │   ├── conversation/           # Intent detection + multi-turn conversation
│   │   │   ├── conversation_agent.py
│   │   │   ├── intent_detector.py
│   │   │   └── memory_manager.py
│   │   ├── outreach/               # Email generation + objection handling
│   │   │   ├── outreach_agent.py
│   │   │   └── prompt_templates.py
│   │   ├── relevance/              # Voyage AI embedding + trend ranking
│   │   │   ├── relevance_engine.py
│   │   │   └── embedding_service.py
│   │   ├── research/               # Company research + context building
│   │   │   ├── research_agent.py
│   │   │   └── context_builder.py
│   │   └── trends/                 # Market trend ingestion
│   │       └── trend_agent.py
│   │
│   ├── governance/                 # Safety layer — see backend/governance/README.md
│   │   ├── risk_engine.py          # Composite risk scorer
│   │   ├── tone_validator.py       # Banned phrases, length limits
│   │   ├── hallucination_checker.py # Claude verifies claims vs source facts
│   │   └── audit_logger.py         # Immutable JSONL audit trail
│   │
│   ├── services/                   # External integrations — see backend/services/README.md
│   │   ├── apollo/
│   │   │   ├── apollo_people.py    # Lead search + person details
│   │   │   ├── apollo_company.py   # Company enrichment
│   │   │   └── apollo_signals.py   # Hiring/growth signals
│   │   ├── email_sender.py         # Gmail SMTP outbound
│   │   ├── gmail_reply_poller.py   # Gmail IMAP inbound reply watcher
│   │   └── lead_context_store.py   # Email → lead context lookup store
│   │
│   ├── learning/
│   │   ├── feedback_collector.py   # Records lead outcomes
│   │   └── learning_engine.py      # Analyzes feedback patterns
│   │
│   ├── scheduling/
│   │   └── scheduler.py            # Calendly API integration
│   │
│   └── storage/                    # Runtime data (gitignored)
│       ├── audit_logs/             # Per-lead audit JSONL
│       ├── conversations/          # Conversation history
│       ├── feedback/               # Outcome records
│       ├── intent_analytics/       # Intent classification events
│       └── lead_contexts/          # Email → lead context map
│
├── frontend/                       # React + TypeScript UI — see frontend/README.md
│   ├── src/
│   │   ├── lib/api.ts              # All backend API calls (single source of truth)
│   │   ├── pages/                  # One file per page/view
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── PipelinePage.tsx
│   │   │   ├── LeadDiscoveryPage.tsx
│   │   │   ├── ApprovalQueuePage.tsx
│   │   │   ├── ConversationsPage.tsx
│   │   │   ├── AuditTrailPage.tsx
│   │   │   └── CampaignsPage.tsx
│   │   ├── components/             # Reusable UI components by domain
│   │   └── context/                # React context (theme, sidebar)
│   └── Dockerfile
│
├── tests/                          # Test suites — see tests/README.md
│   ├── test_conversation_agent.py
│   └── test_research_agent.py
│
├── scripts/                        # Utility scripts — see scripts/README.md
│   ├── run_reply_poller.py         # Start Gmail IMAP watcher
│   ├── process_reply_now.py        # Manually trigger one poll cycle
│   ├── debug_gmail_poller.py       # Debug IMAP connection
│   ├── backfill_lead_contexts.py   # Backfill contexts for existing leads
│   └── test_gmail_imap.py          # Test IMAP credentials
│
├── sample_data/
│   └── demo_companies.json         # 10 sample companies for /company/list
│
└── docs/
    ├── GUIDE.md
    └── demo-flow.md
```

---

## Setup

### Prerequisites

| Requirement | Mac | Windows |
|---|---|---|
| Python 3.9+ | `brew install python` | [python.org](https://python.org) |
| Node.js 18+ | `brew install node` | [nodejs.org](https://nodejs.org) |
| Git | `brew install git` | [git-scm.com](https://git-scm.com) |

### 1. Clone and configure

```bash
git clone https://github.com/DataSynther/LeadGenie-AI.git
cd LeadGenie-AI

cp .env.example .env
# Fill in your API keys — see Environment Variables below
```

### 2. Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
# API available at http://localhost:8000
# Interactive docs at http://localhost:8000/docs
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
# UI available at http://localhost:5173
```

### 4. Gmail Reply Poller (optional — for live email conversations)

```bash
python3 scripts/run_reply_poller.py
# Watches LEADGENIE_GMAIL inbox every 60s for lead replies
```

### Docker (runs everything)

```bash
docker-compose up --build
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in:

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Claude API key — [console.anthropic.com](https://console.anthropic.com) |
| `APOLLO_API_KEY` | Yes | Apollo.io API key — [app.apollo.io](https://app.apollo.io) → Settings → API Keys |
| `VOYAGE_API_KEY` | Yes | Voyage AI embeddings — [voyageai.com](https://voyageai.com) |
| `LEADGENIE_GMAIL` | Yes | Dedicated Gmail address for sending outreach and receiving replies |
| `LEADGENIE_GMAIL_PASSWORD` | Yes | Gmail App Password (not account password) — Google Account → Security → App Passwords |
| `CLAUDE_MODEL` | No | Model override (default: `claude-sonnet-4-6`) |
| `CALENDLY_URL` | No | Meeting booking link sent on meeting requests |
| `REPLY_POLL_INTERVAL` | No | Gmail poll frequency in seconds (default: `60`) |
| `CALENDLY_API_TOKEN` | No | Calendly API for automated scheduling |
| `CALENDLY_ORG_URI` | No | Calendly organization URI |

---

## API Endpoints

All routes are defined in `backend/main.py`. Interactive docs available at `http://localhost:8000/docs`.

### Health
| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Server health check — returns `{"status":"ok","version":"1.0.0"}` |

### Dashboard
| Method | Endpoint | Description |
|---|---|---|
| GET | `/dashboard/stats` | KPI cards, funnel chart, risk distribution, blocked patterns |
| GET | `/agent-feed/recent` | Recent agent activity log for the live feed ticker |

### Leads & Pipeline
| Method | Endpoint | Body / Params | Description |
|---|---|---|---|
| POST | `/leads/search` | `{company_names, titles, seniorities, per_page}` | Search Apollo for leads matching criteria |
| GET | `/pipeline` | — | Full lead pipeline with stage and reply probability |

### Company Intelligence
| Method | Endpoint | Description |
|---|---|---|
| GET | `/company/list` | List all demo companies from `sample_data/` |
| GET | `/company/research/{company_name}` | Deep company data with computed hiring/AI/tech signals |
| GET | `/company/enrich?domain=` | Live Apollo company enrichment by domain |

### Outreach Generation
| Method | Endpoint | Body | Description |
|---|---|---|---|
| POST | `/outreach/generate` | `{lead_id, company_domain}` | Full pipeline: enrich → research → trends → relevance → email → governance |

**Response includes:**
```json
{
  "lead": { ... },
  "company": { ... },
  "top_trends": [ ... ],
  "email": { "subject": "...", "body": "...", "reasoning": "..." },
  "governance": { "approved": true, "risk_score": 0.21, "issues": [] }
}
```

### Conversation & Reply Handling
| Method | Endpoint | Body | Description |
|---|---|---|---|
| POST | `/conversation/reply` | `{lead_id, reply, context}` | Classify intent → generate context-grounded response → optionally send email |
| POST | `/api/webhook/inbound-reply` | Resend/Gmail webhook payload | Inbound email → match lead by sender → run conversation agent |

**Intent types detected:** `interested` · `objection` · `fact_question` · `neutral` · `meeting_request` · `unsubscribe`

**Response includes:**
```json
{
  "lead_id": "...",
  "intent": "fact_question",
  "intent_confidence": 0.87,
  "intent_signal": "asking about platform capabilities",
  "response": "...",
  "conversation_length": 3,
  "email_sent": true
}
```

### Governance & Audit
| Method | Endpoint | Description |
|---|---|---|
| GET | `/approval-queue` | Items flagged for human review (risk ≥ 0.4) with risk level, trigger, and policy |
| GET | `/audit/{lead_id}` | Full decision audit trail for a lead |

### Learning & Analytics
| Method | Endpoint | Body | Description |
|---|---|---|---|
| POST | `/feedback/record` | `{lead_id, outcome, metadata}` | Record lead outcome for learning engine |
| GET | `/learning/analytics` | — | Pattern analysis from feedback history |
| GET | `/trends` | — | Current market trends used by relevance engine |

---

## Governance Model

Every generated email passes through three layers before being sent:

1. **Tone Validator** — strips salesy phrases, enforces length limits
2. **Hallucination Checker** — Claude verifies every claim against source facts
3. **Risk Engine** — composite risk score (0.0–1.0):
   - `< 0.4` → auto-approved, email sent
   - `≥ 0.4` → held in Approval Queue for human review

All decisions written to `backend/storage/audit_logs/{lead_id}.jsonl`.

---

## Intent Detection & Analytics

The `IntentDetector` classifies every inbound reply using Claude and logs the result to `backend/storage/intent_analytics/events.jsonl`.

Each event records: `intent`, `confidence`, `key_signal`, `reasoning`, `lead_id`, `timestamp`, and a context snapshot.

Query analytics programmatically:
```python
from agents.conversation.intent_detector import IntentDetector
summary = IntentDetector().get_summary()
# Returns: { total_events: 31, by_intent: { fact_question: { count, avg_confidence, top_signals }, ... } }
```

---

## Key Dependencies

| Package | Purpose |
|---|---|
| [anthropic](https://pypi.org/project/anthropic/) | Claude for outreach, research, conversation, hallucination checks |
| [voyageai](https://pypi.org/project/voyageai/) | Text embeddings for semantic trend ranking |
| [fastapi](https://fastapi.tiangolo.com) | Backend API framework |
| [apollo.io](https://apollo.io) | Lead + company data (external API) |
| Gmail SMTP/IMAP | Outbound email sending + inbound reply watching |

---

## Branch Structure

| Branch | Purpose |
|---|---|
| `main` | Stable baseline |
| `feat/conversation-reply-loop` | Our branch — conversation agent, intent detection, Gmail loop |
| `feature/kunal-final-code` | Kunal's branch — frontend, dashboard endpoints, pipeline |
| `integration/premerge-phase1` | **This branch** — full integration of both |
