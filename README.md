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
| WhatsApp Follow-up Loop | Schedules personalized WhatsApp fallbacks after email outreach when a phone number is available |
| WhatsApp Inbox | Human-controlled WhatsApp inbox with unread state, active-thread refresh, and outbound replies |
| Governance Engine | Tone validation, hallucination checks, risk scoring |
| Audit Lineage | Immutable per-lead JSONL audit trail for all decisions |
| Continuous Learning | Feedback-driven pattern analysis and prompt improvement |
| Meeting Scheduling | Calendly link sent automatically on meeting requests |
| **AI Observability** | Per-agent tracing, context scoring, prompt ambiguity detection, validation layer |
| **Hallucination Diagnostics** | 5-category root cause breakdown: retrieval / context / prompt / validation / task-mismatch |
| **Mission Control Dashboard** | Live KPI cards, funnel chart, risk distribution, pipeline latency histogram (per-stage stacked bars), agent feed, outreach queue summary |
| **Pipeline Latency Chart** | Stacked bar histogram on Mission Control — each run on x-axis, segments show time spent in each pipeline stage |
| **Live Pipeline Streaming** | SSE-based stage-by-stage progress toast (bottom-right) — visible from any page during email generation |
| **FinOps Dashboard** | Per-agent cost/token tracking, retry cost analysis, avg cost per email trend, governance cost breakdown |
| **AWS V2 Deployment** | ECS Fargate + CDK IaC, auto-sleep after 15 min inactivity, CloudWatch alarms, budget alerts |

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

### WhatsApp Follow-up Flow

```
Email sent through /outreach/send
        |
        v
FollowupScheduler writes backend/storage/followups/{lead_id}.json
        |
        v
Due follow-up triggers personalized WhatsApp generation
        |
        v
Twilio/Render WhatsApp service sends message
        |
        v
Outbound message is stored in memory + backend/storage/whatsapp_conversations
        |
        v
Lead replies on WhatsApp
        |
        v
Twilio webhook posts to /whatsapp or /api/webhook/whatsapp-reply
        |
        v
Render mailbox importer persists inbound message + marks follow-up replied
        |
        v
WhatsApp Inbox at /whatsapp shows the active conversation
```

---

## Folder Structure

```
LeadGenie-AI/
├── .env.example                    # Environment variable template (copy → .env)
├── .gitignore
├── docker-compose.yml              # Original single-service compose
├── docker-compose.local-v2.yml     # Full V2 local stack (API + Worker + Frontend + Postgres + Redis)
├── docker-compose.share.yml        # Shareable compose using pre-built Docker Hub images
├── run_test_pipeline.py            # End-to-end simulation script (6 leads)
│
├── .github/
│   └── workflows/
│       └── deploy-v2.yml           # GitHub Actions CI/CD → AWS V2 (ECS Fargate)
│
├── infrastructure/                 # AWS deployment (branch: aws/deploy-v2)
│   ├── DEPLOY.md                   # Step-by-step AWS deployment guide
│   ├── cdk/                        # AWS CDK v2 stacks (Python)
│   │   ├── app.py                  # CDK entry point — wires all stacks
│   │   ├── cdk.json
│   │   ├── requirements.txt
│   │   └── stacks/
│   │       ├── vpc_stack.py        # VPC, subnets, security groups
│   │       ├── data_stack.py       # RDS, ElastiCache Redis, DynamoDB, S3, Secrets Manager
│   │       ├── compute_stack.py    # ECS cluster, API + Worker Fargate services, ALB
│   │       ├── frontend_stack.py   # CloudFront + S3 SPA
│   │       └── monitoring_stack.py # CloudWatch alarms, SNS alerts, budget, auto-sleep Lambda
│   └── lambdas/
│       ├── sleep_checker/handler.py # Auto-sleep: scales ECS to 0 after 15 min inactivity
│       └── wake/handler.py          # Wake endpoint: scales services back up, returns status page
│
├── docs/
│   ├── architecture/               # AWS architecture diagrams (PNG + SVG + source)
│   │   ├── aws_v1_demo.png / .svg  # V1 serverless (Lambda, no ECS)
│   │   ├── aws_v2_production.png / .svg  # V2 production (ECS Fargate)
│   │   └── aws_v1_demo.py / aws_v2_production.py  # Diagrams-as-Code source
│   ├── GUIDE.md
│   ├── architecture.md
│   └── demo-flow.md
│
├── backend/                        # FastAPI backend — see backend/README.md
│   ├── main.py                     # All API routes (single entry point)
│   ├── requirements.txt
│   ├── Dockerfile                  # API server image (Python 3.11-slim, port 8000)
│   ├── Dockerfile.worker           # Agent worker image (SQS consumer, no HTTP port)
│   ├── worker/
│   │   └── __main__.py             # Worker entry point — SQS in AWS, file-queue locally
│   ├── middleware/
│   │   └── activity_tracker.py     # Updates DynamoDB last_activity on each request (auto-sleep)
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
│   ├── observability/              # Governed AI diagnostic layer — see observability/README.md
│   │   ├── diagnostic_store.py     # JSONL persistence + query helpers + 5 category constants
│   │   ├── agent_tracer.py         # Context manager wrapping every Claude call
│   │   └── validator.py            # Shape/context/policy/business rule checks → allow/block/defer
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
│       ├── diagnostics/            # Agent traces + validation events (observability layer)
│       ├── feedback/               # Outcome records
│       ├── intent_analytics/       # Intent classification events
│       ├── pipeline_runs.jsonl     # Per-run stage timing records (feeds latency histogram)
│       └── lead_contexts/          # Email → lead context map
│
├── frontend/                       # React + TypeScript UI — see frontend/README.md
│   ├── src/
│   │   ├── lib/api.ts              # All backend API calls (single source of truth)
│   │   ├── pages/                  # One file per page/view
│   │   │   ├── DashboardPage.tsx       # Mission Control — KPIs, funnel, risk distribution
│   │   │   ├── FinOpsDashboardPage.tsx # FinOps — cost/token trends, retry analysis, C2S
│   │   │   ├── PipelinePage.tsx
│   │   │   ├── LeadDiscoveryPage.tsx
│   │   │   ├── ApprovalQueuePage.tsx
│   │   │   ├── ConversationsPage.tsx
│   │   │   ├── AuditTrailPage.tsx
│   │   │   ├── KbFactsPage.tsx         # Knowledge base fact browser
│   │   │   ├── ArchitecturePage.tsx    # Embedded AWS architecture diagrams
│   │   │   ├── CampaignsPage.tsx
│   │   │   └── DevDashboardPage.tsx    # Live AI observability dashboard (route: /dev)
│   │   ├── components/             # Reusable UI components by domain
│   │   └── context/                # React context (theme, sidebar)
│   └── Dockerfile
│
├── tests/                          # Test suites — see tests/README.md
│   ├── test_conversation_agent.py
│   └── test_research_agent.py
│
├── scripts/                        # Utility scripts — see scripts/README.md
│   ├── smoke_test_local.sh         # Automated smoke test against the local Docker stack
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

### Where to access everything

Once both servers are running:

| What | URL |
|---|---|
| **AI Observability Dashboard** | http://localhost:5173/dev |
| **Lead Discovery** | http://localhost:5173/discover |
| **Mission Control (Dashboard)** | http://localhost:5173/dashboard |
| **Pipeline** | http://localhost:5173/pipeline |
| **Approval Queue** | http://localhost:5173/approval |
| **Conversations** | http://localhost:5173/conversations |
| **WhatsApp Inbox** | http://localhost:5173/whatsapp |
| **Audit Trail** | http://localhost:5173/audit |
| **Backend API (interactive docs)** | http://localhost:8000/docs |
| **Backend API (ReDoc)** | http://localhost:8000/redoc |

### 4. Gmail Reply Poller (optional — for live email conversations)

```bash
python3 scripts/run_reply_poller.py
# Watches LEADGENIE_GMAIL inbox every 60s for lead replies
```


### 5. WhatsApp Follow-up Scheduler (optional — for no-reply fallback)

```bash
python3 scripts/run_followup_scheduler.py
# After email send, waits WHATSAPP_FOLLOWUP_WAIT_MINUTES, then sends WhatsApp if no reply was detected
```
---

## Running with Docker (Windows & Mac)

> **No Python or Node.js required.** Docker handles everything.

### Prerequisites

| Platform | Install |
|---|---|
| **Mac** | [OrbStack](https://orbstack.dev) (recommended) or [Docker Desktop](https://www.docker.com/products/docker-desktop/) |
| **Windows** | [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/) — enable WSL 2 backend during install |

---

### Option A — Pull pre-built images (fastest, no code needed)

Ideal for teammates who just want to run the app.

**1. Create a `.env` file** in any folder with your API keys:

```env
ANTHROPIC_API_KEY=sk-ant-...
APOLLO_API_KEY=...
VOYAGE_API_KEY=...
GMAIL_APP_PASSWORD=...
RESEND_API_KEY=...
```

**2. Download `docker-compose.share.yml`** from this repo (or copy the block below) into the same folder as `.env`.

**3. Start everything:**

```bash
# Mac / Linux
docker compose -f docker-compose.share.yml up

# Windows (PowerShell or Command Prompt)
docker compose -f docker-compose.share.yml up
```

**4. Open the app:** http://localhost:3000  
**API docs:** http://localhost:8000/docs  
Login: `demo` / `demo123`

**To stop:**
```bash
docker compose -f docker-compose.share.yml down
```

---

### Option B — Build locally from source (full dev setup)

```bash
git clone https://github.com/DataSynther/LeadGenie-AI.git
cd LeadGenie-AI
cp .env.example .env
# Fill in your API keys in .env

# Build and start (takes ~3 min on first run)
docker compose -f docker-compose.local-v2.yml up --build
```

Once all containers are healthy (~60 seconds after build):

| What | URL |
|---|---|
| **App (React frontend)** | http://localhost:3000 |
| **API interactive docs** | http://localhost:8000/docs |
| **API ReDoc** | http://localhost:8000/redoc |
| **Health check** | http://localhost:8000/health |

Run the smoke test to verify everything works:
```bash
bash scripts/smoke_test_local.sh
```

**To stop:**
```bash
docker compose -f docker-compose.local-v2.yml down
```

---

### Publishing updated images (maintainers only)

When you want to push a new version for teammates to pull:

```bash
export DH=YOUR_DOCKERHUB_USERNAME

docker buildx build --platform linux/amd64 -f backend/Dockerfile \
  -t $DH/leadgenie-api:latest --push .

docker buildx build --platform linux/amd64 -f backend/Dockerfile.worker \
  -t $DH/leadgenie-worker:latest --push .

docker buildx build --platform linux/amd64 -f frontend/Dockerfile \
  --build-arg VITE_API_URL=http://localhost:8000 \
  -t $DH/leadgenie-frontend:latest --push ./frontend
```

> Images are built for `linux/amd64` so they run on both Windows (x86) and Mac (Apple Silicon via Rosetta).

---

## AWS Deployment (V2 Production)

Full infrastructure-as-code deployment on ECS Fargate. See [`infrastructure/DEPLOY.md`](infrastructure/DEPLOY.md) for the complete setup guide.

### Architecture

| Layer | Service |
|---|---|
| Frontend | CloudFront + S3 |
| API | ECS Fargate (2 tasks, auto-scales on CPU + requests) |
| Workers | ECS Fargate Spot (0–8 tasks, scales on SQS queue depth) |
| Database | RDS Postgres t3.medium Multi-AZ + pgvector |
| Cache | ElastiCache Redis t3.small (semantic cache + working memory) |
| Job queue | SQS (decouples HTTP from long agent chains) |
| Secrets | AWS Secrets Manager (all API keys) |
| Monitoring | CloudWatch dashboard + alarms + X-Ray tracing |

### Auto-Sleep (15-minute inactivity)

The system automatically scales ECS to 0 tasks after 15 minutes with no API requests, cutting running costs to near zero during idle periods.

```
Every API request
    → ActivityTrackerMiddleware (backend/middleware/activity_tracker.py)
    → writes last_activity timestamp to DynamoDB (at most 1 write/60s)

EventBridge every 5 min
    → sleep_checker Lambda
    → if now - last_activity > 15 min AND tasks > 0
    → scale API + Worker services to 0
    → send email alert with wake URL

Wake URL (API Gateway → wake Lambda)
    → scale services back to desired count
    → return animated "Waking up…" HTML page (auto-refreshes every 20s until healthy)
```

### CloudWatch Alerts

| Alert | Condition |
|---|---|
| `leadgenie-service-sleeping` | Task count drops to 0 |
| `leadgenie-high-cpu` | CPU > 80% for 10 min |
| `leadgenie-error-rate` | >10 HTTP 5xx errors in 5 min |
| AWS Budget 50% | Monthly spend crosses 50% of $30 limit |
| AWS Budget 90% | Monthly spend crosses 90% of $30 limit |

### Deploy via GitHub Actions

```bash
git checkout aws/deploy-v2
git push origin aws/deploy-v2
# GitHub Actions automatically:
# 1. Builds + pushes Docker images to ECR
# 2. Runs CDK to deploy/update all AWS infrastructure
# 3. Syncs React SPA to S3 + invalidates CloudFront
# 4. Rolling ECS deploy (waits for service stability)
# 5. Smoke test → SNS success/failure notification
```

**Required GitHub Secrets:** `AWS_DEPLOY_ROLE_ARN`, `AWS_ACCOUNT_ID`, `ALERT_EMAIL`, and all app API keys. See [`infrastructure/DEPLOY.md`](infrastructure/DEPLOY.md).

### Cost Estimate

| | V1 Demo (Lambda, no ECS) | V2 Production (ECS Fargate) |
|---|---|---|
| Always-on infra | RDS t3.micro ~$15/mo | RDS + ElastiCache + ALB ~$85/mo |
| Active compute | Lambda ~$0.10/hr | ECS Fargate ~$0.94/hr |
| 3-day test (5h/day) | **~$1.50** | **~$14** |
| With auto-sleep | Minimal | Saves ~$1.18/day in ECS when idle |

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
| `FOLLOWUP_SCHEDULER_AUTOSTART` | No | Enable backend WhatsApp follow-up scheduler on startup (default: `true`) |
| `FOLLOWUP_SCHEDULER_INTERVAL_SECONDS` | No | Scheduler polling interval for due WhatsApp follow-ups (default: `15`) |
| `WHATSAPP_FOLLOWUP_WAIT_MINUTES` | No | Delay after email before WhatsApp fallback is due (default: `2`) |
| `WHATSAPP_API_URL` | No | Outbound WhatsApp send endpoint, usually the Render `/send-whatsapp` service |
| `WHATSAPP_REQUEST_TIMEOUT_SECONDS` | No | Timeout for outbound WhatsApp sends (default: `90`) |
| `WHATSAPP_PENDING_MESSAGES_URL` | No | Remote Render mailbox `/pending-messages` URL used by inbox sync |
| `WHATSAPP_PENDING_REQUEST_TIMEOUT_SECONDS` | No | Timeout for fetching remote pending WhatsApp replies (default: `20`) |
| `WHATSAPP_LOCAL_MAILBOX_DIR` | No | Local pending-message cache directory for backend imports |
| `TWILIO_ACCOUNT_SID` | Render mailbox | Twilio Account SID used by `backend/render_whatsapp_mailbox_app.py` |
| `TWILIO_AUTH_TOKEN` | Render mailbox | Twilio auth token used by the Render mailbox app |
| `TWILIO_WHATSAPP_FROM` | Render mailbox | Twilio WhatsApp sender, default `whatsapp:+14155238886` |
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
| GET | `/dashboard/pipeline-latency?n=30` | Last N pipeline runs with per-stage durations in seconds (latency histogram data) |
| GET | `/dashboard/outreach-trend?days=30` | Daily outreach volume (total + approved) for the past N days |
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
| POST | `/outreach/generate` | `{lead_id, company_domain}` | Full pipeline (blocking): enrich → research → trends → relevance → email → governance |
| POST | `/outreach/generate/stream` | `{lead_id, company_domain, vertical, domain}` | Same pipeline over SSE — streams stage events in real time; final event contains full result |
| POST | `/outreach/suggest` | `{lead_id, company_domain}` | Fast pre-check (no Claude): enriches lead + company, detects domain/vertical, returns chip options |

Additional outreach send endpoint:

| Method | Endpoint | Body | Description |
|---|---|---|---|
| POST | `/outreach/send` | `{lead_id, to_email, phone, subject, body, reasoning, context}` | Send approved email and schedule WhatsApp fallback when phone is available |

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

### WhatsApp Follow-ups & Inbox
| Method | Endpoint | Body / Params | Description |
|---|---|---|---|
| POST | `/whatsapp` | Twilio form payload or JSON with `From`/`Body` | Inbound WhatsApp webhook; stores and imports the lead reply |
| POST | `/api/webhook/whatsapp-reply` | Same as `/whatsapp` | Alternate inbound WhatsApp webhook path |
| GET | `/whatsapp/conversations` | - | List active WhatsApp inbox conversations; also syncs remote pending Render messages |
| GET | `/whatsapp/conversations/{conversation_id}` | - | Fetch one WhatsApp conversation thread |
| POST | `/whatsapp/conversations/{conversation_id}/open` | `{}` | Mark a conversation as read/opened |
| DELETE | `/whatsapp/conversations/{conversation_id}` | - | Delete a WhatsApp inbox conversation |
| POST | `/whatsapp/reply` | `{conversation_id, lead_id, message}` | Send a human-authored WhatsApp reply and append it to the thread |
| GET | `/whatsapp/debug` | - | Debug remote/local mailbox status and inbox counts |
| GET | `/pending-messages` | - | Inspect locally cached pending WhatsApp messages |

The WhatsApp Inbox UI uses these endpoints from `frontend/src/lib/api.ts` and is available at `/whatsapp`.

### Render WhatsApp Mailbox App
`backend/render_whatsapp_mailbox_app.py` is the lightweight Twilio-facing service usually deployed separately on Render.

| Method | Endpoint | Body / Params | Description |
|---|---|---|---|
| GET | `/` | - | Render mailbox health/status |
| POST | `/send-whatsapp` | `{phone, message}` | Send outbound WhatsApp through Twilio |
| POST | `/whatsapp` | Twilio form payload or JSON with `From`/`Body` | Receive inbound Twilio WhatsApp replies and queue them |
| GET | `/pending-messages` | - | Expose queued inbound messages for the main backend importer |

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

### Developer Observability (Phase 1)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/dev/diagnostics` | 5-category hallucination diagnostic summary with counts and recent events |
| GET | `/dev/agent-metrics` | Per-agent: total calls, success rate, avg latency, avg tokens, avg confidence, validation pass rate |
| GET | `/dev/traces?limit=50` | Recent agent call traces with latency, tokens, context score, ambiguity score, diagnostic categories |
| GET | `/dev/validation-log?limit=50` | Recent validation events: shape/context/policy outcomes and consequence |

---

## Governance Model

Every generated email passes through three layers before being sent:

1. **Tone Validator** — strips salesy phrases, enforces length limits (subject ≤ 8 words, body ≤ 10 sentences, ≤ 1 exclamation mark)
2. **Hallucination Checker** — Claude Haiku verifies every claim in opening hook + value prop + social proof against source facts and KB claims
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
| `feat/conversation-reply-loop` | Conversation agent, intent detection, Gmail loop |
| `feature/kunal-final-code` | Frontend, dashboard endpoints, pipeline |
| `integration/premerge-phase1` | Full integration of conversation + frontend layers |
| `feature/governed-dashboard-phase1` | Phase 1 observability layer: agent tracer, validator, dev dashboard |
| `av-alen-endtoend-final` | **Current main dev branch** — FinOps dashboard, Mission Control, WhatsApp, approval queue |
| `aws/deploy-v2` | **AWS production deployment** — ECS Fargate, CDK IaC, auto-sleep, GitHub Actions CI/CD |
