# LeadGenie AI — Complete Operational Guide

> Covers every module, how to run it, example API calls, and full deployment instructions.

---

## Table of Contents

1. [Environment Setup](#1-environment-setup)
2. [Module Reference](#2-module-reference)
   - [Apollo Services](#21-apollo-services)
   - [Research & Context Engine](#22-research--context-engine)
   - [Trend Intelligence Engine](#23-trend-intelligence-engine)
   - [Semantic Relevance Engine](#24-semantic-relevance-engine)
   - [Outreach Generation Engine](#25-outreach-generation-engine)
   - [Conversation Agent](#26-conversation-agent)
   - [Governance Engine](#27-governance-engine)
   - [Learning Engine](#28-learning-engine)
   - [Scheduling Module](#29-scheduling-module)
3. [Running the API Server](#3-running-the-api-server)
4. [API Endpoint Reference](#4-api-endpoint-reference)
5. [End-to-End Pipeline Example](#5-end-to-end-pipeline-example)
6. [Deployment](#6-deployment)
   - [Local with Docker Compose](#61-local-with-docker-compose)
   - [Deploy to AWS EC2](#62-deploy-to-aws-ec2)
   - [Deploy to Railway](#63-deploy-to-railway)
   - [Deploy to Render](#64-deploy-to-render)

---

## 1. Environment Setup

### Install Dependencies

```bash
# Create virtual environment
python3 -m venv venv
source venv/bin/activate        # Mac/Linux
# source venv/Scripts/activate       # Windows

# Install packages
pip install -r requirements.txt
```

### Configure Environment Variables

```bash
cp .env.example .env
```

Open `.env` and fill in your keys:

| Variable | Where to Get It | Required |
|---|---|---|
| `APOLLO_API_KEY` | [apollo.io](https://apollo.io) → Settings → API | Yes |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) | Yes |
| `VOYAGE_API_KEY` | [voyageai.com](https://voyageai.com) → API Keys | Yes |
| `CALENDLY_API_TOKEN` | Calendly → Integrations → API & Webhooks | Optional |
| `CALENDLY_ORG_URI` | Calendly API → `/users/me` response | Optional |
| `CLAUDE_MODEL` | Default: `claude-sonnet-4-6` | No |

---

## 2. Module Reference

---

### 2.1 Apollo Services

**Location:** `backend/services/apollo/`

**What it does:** Fetches raw lead, company, and signal data from Apollo.io.

#### Files

| File | Class | Purpose |
|---|---|---|
| `apollo_people.py` | `ApolloPeopleService` | Search leads by domain/title/seniority |
| `apollo_company.py` | `ApolloCompanyService` | Enrich company by domain or org ID |
| `apollo_signals.py` | `ApolloSignalsService` | Detect hiring trends from job postings |

#### Usage

```python
from services.apollo import ApolloPeopleService, ApolloCompanyService, ApolloSignalsService

# Search leads
people = ApolloPeopleService()
leads = people.search_people({
    "domains": ["acme.com"],
    "titles": ["VP of Sales", "Head of Revenue"],
    "seniorities": ["vp", "director"],
    "per_page": 10
})

# Enrich a company
company_svc = ApolloCompanyService()
company = company_svc.enrich_company("acme.com")
print(company["industry"], company["employee_count"], company["funding_stage"])

# Get hiring signals
signals_svc = ApolloSignalsService()
signals = signals_svc.detect_hiring_trends(org_id="org_123")
print(signals["ai_hiring"], signals["scaling_signal"])
```

---

### 2.2 Research & Context Engine

**Location:** `backend/agents/research/`

**What it does:** Uses Claude to produce a structured company research brief, then assembles all intelligence into a unified context object.

#### Files

| File | Class | Key Methods |
|---|---|---|
| `research_agent.py` | `ResearchAgent` | `research_company(company, signals)` → summary, pain points, AI readiness score |
| `context_builder.py` | `ContextBuilder` | `build_lead_context(lead, company, signals, research)` → unified dict |

#### Usage

```python
from backend.agents.research.research_agent import ResearchAgent
from backend.agents.research.context_builder import ContextBuilder

researcher = ResearchAgent()
builder = ContextBuilder()

# Research a company (calls Claude)
research = researcher.research_company(company, signals)
# Returns: {summary, growth_stage, strategic_priorities, likely_pain_points, ai_readiness_score}

# Identify growth stage without Claude
stage = builder.identify_growth_stage(company)
# Returns: "early-stage" | "growth" | "scale-up"

# Build unified context
context = builder.build_lead_context(lead, company, signals, research)
# Returns a nested dict with lead, company, signals, research sections
```

#### Output Shape

```json
{
  "lead": { "name": "Sarah Chen", "title": "VP RevOps", ... },
  "company": { "name": "Acme", "industry": "Software", ... },
  "signals": { "open_roles": 45, "ai_hiring": 8, "scaling": true },
  "research": {
    "summary": "...",
    "growth_stage": "scale-up",
    "pain_points": ["manual reporting", "data silos"],
    "ai_readiness_score": 7
  }
}
```

---

### 2.3 Trend Intelligence Engine

**Location:** `backend/agents/trends/`

**What it does:** Manages a store of market trends. Pulls from curated trends and RSS feeds. Persists to `trend_store.json`.

#### Files

| File | Class | Key Methods |
|---|---|---|
| `trend_agent.py` | `TrendAgent` | `ingest_trends()`, `get_current_trends()` |
| `trend_store.json` | — | Local trend cache (auto-updated) |

#### Usage

```python
from backend.agents.trends.trend_agent import TrendAgent

trend_agent = TrendAgent()

# Fetch and refresh trends from RSS + curated list
trends = trend_agent.ingest_trends()

# Get stored trends (refreshes only if store is empty)
trends = trend_agent.get_current_trends()
# Returns list of: {id, title, category, relevance_tags, source, date}
```

#### Adding Custom Trends

Edit `trend_agent.py` → `CURATED_TRENDS` list. Each entry:

```python
{
    "id": "t006",
    "title": "Your Trend Title",
    "category": "technology",        # technology | regulatory | business | funding | news
    "relevance_tags": ["ai", "saas"],
    "source": "curated",
    "date": "2026-05-25"
}
```

---

### 2.4 Semantic Relevance Engine

**Location:** `backend/agents/relevance/`

**What it does:** Embeds lead context and trend texts using Voyage AI, then ranks trends by cosine similarity. This is the most important module — it ensures outreach references trends actually relevant to this specific lead.

#### Files

| File | Class | Key Methods |
|---|---|---|
| `embedding_service.py` | `EmbeddingService` | `embed_text(text)`, `cosine_similarity(a, b)`, `batch_embed(texts)` |
| `relevance_engine.py` | `RelevanceEngine` | `rank_trends(context, trends, top_k)`, `score_relevance(context, trend)` |

#### Usage

```python
from backend.agents.relevance.relevance_engine import RelevanceEngine

engine = RelevanceEngine()

# Rank top 3 most relevant trends for a lead
top_trends = engine.rank_trends(context, trends, top_k=3)
# Each trend gets a `relevance_score` field added (0.0 - 1.0)

# Score a single trend
score = engine.score_relevance(context, trends[0])
print(score)   # e.g. 0.847
```

---

### 2.5 Outreach Generation Engine

**Location:** `backend/agents/outreach/`

**What it does:** Calls Claude with the unified lead context and top relevant trends to generate personalized, constrained outreach emails.

#### Files

| File | Class | Key Methods |
|---|---|---|
| `outreach_agent.py` | `OutreachAgent` | `generate_email()`, `generate_follow_up()`, `respond_to_objection()` |
| `prompt_templates.py` | — | `INITIAL_EMAIL_TEMPLATE`, `FOLLOW_UP_TEMPLATE`, `OBJECTION_RESPONSE_TEMPLATE` |

#### Usage

```python
from backend.agents.outreach.outreach_agent import OutreachAgent

agent = OutreachAgent()

# Generate initial cold email
email = agent.generate_email(context, top_trends)
# Returns: {subject, body, reasoning}

# Generate follow-up
follow_up = agent.generate_follow_up(context, conversation_summary="They opened but didn't reply.")
# Returns: {subject, body}

# Handle an objection
response = agent.respond_to_objection(context, "We already have a solution for this.")
# Returns: {response_text, approach_used}
```

#### Customising Prompt Templates

Edit `prompt_templates.py` to change tone, constraints, or CTA style. Template variables use `{variable_name}` format. All three templates expect a JSON response from Claude.

---

### 2.6 Conversation Agent

**Location:** `backend/agents/conversation/`

**What it does:** Handles inbound replies from leads, maintaining per-lead conversation memory across turns. Routes objections to the outreach agent for specialised handling.

#### Files

| File | Class | Key Methods |
|---|---|---|
| `conversation_agent.py` | `ConversationAgent` | `handle_reply(lead_id, reply, context)`, `handle_objection(lead_id, objection, context)` |
| `memory_manager.py` | `MemoryManager` | `store_message()`, `get_history()`, `summarize_history()`, `clear()` |

#### Usage

```python
from backend.agents.conversation.conversation_agent import ConversationAgent
from backend.agents.conversation.memory_manager import MemoryManager

agent = ConversationAgent()
memory = MemoryManager()

# Handle an inbound reply
result = agent.handle_reply(
    lead_id="lead_001",
    reply="Hi, thanks for reaching out. What exactly do you do?",
    context=context
)
print(result["response"])

# View conversation history
history = memory.get_history("lead_001")

# Clear a lead's history (e.g. after deal closed)
memory.clear("lead_001")
```

**Conversation history is stored at:** `backend/storage/conversations/{lead_id}.json`

---

### 2.7 Governance Engine

**Location:** `backend/governance/`

**What it does:** The core differentiator. Every generated email goes through three checks before it can be sent. All decisions are logged immutably.

#### Files

| File | Class | Purpose |
|---|---|---|
| `risk_engine.py` | `RiskEngine` | Orchestrates all checks, computes risk score, logs decision |
| `tone_validator.py` | `ToneValidator` | Checks banned phrases, email length, excessive punctuation |
| `hallucination_checker.py` | `HallucinationChecker` | Claude verifies no fabricated claims vs source facts |
| `audit_logger.py` | `AuditLogger` | Writes/reads immutable JSONL audit events per lead |

#### Usage

```python
from backend.governance.risk_engine import RiskEngine
from backend.governance.audit_logger import AuditLogger

risk = RiskEngine()

# Run full governance check
result = risk.evaluate(
    lead_id="lead_001",
    content={"subject": "...", "body": "..."},
    source_facts={"company_name": "Acme", "industry": "Software", "lead_title": "VP RevOps"}
)
# Returns:
# {
#   "approved": true/false,
#   "risk_score": 0.15,
#   "issues": [],
#   "event_id": "uuid",
#   "requires_human_review": false
# }

# View audit trail for a lead
audit = AuditLogger()
trail = audit.get_audit_trail("lead_001")

# Human approves a flagged email
audit.update_decision("lead_001", event_id="uuid-here", decision="approved")
```

#### Risk Score Thresholds

| Score | Meaning | Action |
|---|---|---|
| 0.0 – 0.39 | Low risk | Auto-approved |
| 0.4 – 0.69 | Medium risk | Flagged for human review |
| 0.7 – 1.0 | High risk | Rejected |

**Audit logs stored at:** `backend/storage/audit_logs/{lead_id}.jsonl`

---

### 2.8 Learning Engine

**Location:** `backend/learning/`

**What it does:** Records interaction outcomes and uses pattern analysis to improve future outreach. Escalates to human review if performance degrades.

#### Files

| File | Class | Key Methods |
|---|---|---|
| `feedback_collector.py` | `FeedbackCollector` | `record_outcome()`, `get_successful_patterns()` |
| `learning_engine.py` | `LearningEngine` | `analyze_patterns()`, `get_optimized_guidance()`, `should_escalate()` |

#### Valid Outcome Types

`meeting_booked` · `replied` · `no_reply` · `unsubscribed` · `objection` · `approved` · `rejected`

#### Usage

```python
from backend.learning.feedback_collector import FeedbackCollector
from backend.learning.learning_engine import LearningEngine

collector = FeedbackCollector()
engine = LearningEngine()

# Record an outcome
collector.record_outcome("lead_001", "meeting_booked", {"email_version": "v2"})
collector.record_outcome("lead_002", "unsubscribed")

# Analyze patterns
stats = engine.analyze_patterns()
# Returns: {total_interactions, outcome_distribution, meeting_rate, reply_rate, unsubscribe_rate}

# Get Claude-generated improvement guidance
guidance = engine.get_optimized_guidance(context)
print(guidance)

# Check if human escalation is needed
if engine.should_escalate():
    print("Performance degraded — review outreach strategy")
```

**Feedback stored at:** `backend/storage/feedback/outcomes.jsonl`

---

### 2.9 Scheduling Module

**Location:** `backend/scheduling/`

**What it does:** Integrates with Calendly to generate booking links and confirm meetings.

#### Files

| File | Class | Key Methods |
|---|---|---|
| `scheduler.py` | `Scheduler` | `get_event_types()`, `generate_scheduling_link()`, `suggest_meeting_copy()`, `confirm_meeting()` |

#### Usage

```python
from backend.scheduling.scheduler import Scheduler

sched = Scheduler()

# Get available meeting types
event_types = sched.get_event_types()
event_uri = event_types[0]["uri"]

# Generate a one-time booking link
link = sched.generate_scheduling_link(event_uri)

# Get the CTA sentence to embed in email
cta = sched.suggest_meeting_copy("Sarah", link)
# → "Would you be open to a quick 20-minute call, Sarah? You can grab time here: ..."

# Confirm a booked meeting
details = sched.confirm_meeting(event_uri="event-uuid-here")
print(details["start_time"], details["status"])
```

---

## 3. Running the API Server

```bash
# Activate your virtual environment first
source venv/bin/activate

# Start the FastAPI server with live reload
uvicorn backend.main:app --reload --port 8000
```

The API will be running at `http://localhost:8000`

Interactive docs (Swagger UI): `http://localhost:8000/docs`
Alternative docs (ReDoc): `http://localhost:8000/redoc`

---

## 4. API Endpoint Reference

### `POST /leads/search`

Search leads by domain and persona.

```bash
curl -X POST http://localhost:8000/leads/search \
  -H "Content-Type: application/json" \
  -d '{
    "domains": ["acme.com"],
    "titles": ["VP of Sales", "Head of Revenue"],
    "seniorities": ["vp", "director"],
    "per_page": 10
  }'
```

---

### `GET /company/enrich`

Enrich a company by domain.

```bash
curl "http://localhost:8000/company/enrich?domain=acme.com"
```

---

### `POST /outreach/generate`

Full pipeline: enriches lead → builds context → ranks trends → generates governed email.

```bash
curl -X POST http://localhost:8000/outreach/generate \
  -H "Content-Type: application/json" \
  -d '{
    "lead_id": "apollo_lead_id_here",
    "company_domain": "acme.com"
  }'
```

**Response includes:**
- `lead` — normalized lead data
- `company` — enriched company data
- `top_trends` — top 3 semantically relevant trends
- `email` — generated subject + body + reasoning
- `governance` — approved/flagged, risk score, issues, event ID

---

### `POST /conversation/reply`

Handle an inbound reply from a lead.

```bash
curl -X POST http://localhost:8000/conversation/reply \
  -H "Content-Type: application/json" \
  -d '{
    "lead_id": "lead_001",
    "reply": "Interesting, tell me more about how this works.",
    "context": { "lead": {...}, "company": {...}, "research": {...} }
  }'
```

---

### `POST /feedback/record`

Record the outcome of an outreach interaction.

```bash
curl -X POST http://localhost:8000/feedback/record \
  -H "Content-Type: application/json" \
  -d '{
    "lead_id": "lead_001",
    "outcome": "meeting_booked",
    "metadata": { "email_version": "v1", "days_to_reply": 2 }
  }'
```

---

### `GET /learning/analytics`

View current performance metrics.

```bash
curl http://localhost:8000/learning/analytics
```

---

### `GET /trends`

List all current market trends.

```bash
curl http://localhost:8000/trends
```

---

### `GET /audit/{lead_id}`

View the full governance audit trail for a specific lead.

```bash
curl http://localhost:8000/audit/lead_001
```

---

## 5. End-to-End Pipeline Example

Full Python walkthrough from lead discovery to governed outreach:

```python
import os
from dotenv import load_dotenv
load_dotenv()

from backend.services.apollo import ApolloPeopleService, ApolloCompanyService, ApolloSignalsService
from backend.agents.research.research_agent import ResearchAgent
from backend.agents.research.context_builder import ContextBuilder
from backend.agents.trends.trend_agent import TrendAgent
from backend.agents.relevance.relevance_engine import RelevanceEngine
from backend.agents.outreach.outreach_agent import OutreachAgent
from backend.governance.risk_engine import RiskEngine
from backend.learning.feedback_collector import FeedbackCollector

# Step 1 — Find leads
leads = ApolloPeopleService().search_people({
    "domains": ["acme.com"],
    "titles": ["VP Revenue Operations"],
    "per_page": 5
})
lead = leads[0]

# Step 2 — Enrich company
company = ApolloCompanyService().enrich_company("acme.com")

# Step 3 — Get hiring signals
signals = ApolloSignalsService().detect_hiring_trends(lead["organization_id"])

# Step 4 — Research company with Claude
research = ResearchAgent().research_company(company, signals)

# Step 5 — Build unified context
context = ContextBuilder().build_lead_context(lead, company, signals, research)

# Step 6 — Get relevant trends
trends = TrendAgent().get_current_trends()
top_trends = RelevanceEngine().rank_trends(context, trends, top_k=3)

# Step 7 — Generate outreach email
email = OutreachAgent().generate_email(context, top_trends)
print("Subject:", email["subject"])
print("Body:", email["body"])

# Step 8 — Governance check
source_facts = {
    "company_name": company["name"],
    "industry": company["industry"],
    "lead_title": lead["title"]
}
gov = RiskEngine().evaluate(lead["id"], email, source_facts)
print("Approved:", gov["approved"], "| Risk Score:", gov["risk_score"])

# Step 9 — Record outcome later
FeedbackCollector().record_outcome(lead["id"], "meeting_booked")
```

---

## 6. Deployment

---

### 6.1 Local with Docker Compose

**Prerequisites:** Docker Desktop installed and running.

```bash
# Build and start all services (backend + frontend + redis)
docker-compose up --build

# Run in background
docker-compose up --build -d

# Stop everything
docker-compose down

# View logs
docker-compose logs -f backend
```

You'll also need a `Dockerfile` in the root:

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

### 6.2 Deploy to AWS EC2

```bash
# 1. SSH into your EC2 instance
ssh -i your-key.pem ec2-user@your-ec2-ip

# 2. Install dependencies on the server
sudo yum update -y
sudo yum install git python3 python3-pip -y

# 3. Clone the repo
git clone https://github.com/DataSynther/LeadGenie-AI.git
cd LeadGenie-AI

# 4. Set up environment
pip3 install -r requirements.txt
cp .env.example .env
nano .env    # Fill in your API keys

# 5. Run with gunicorn (production)
pip3 install gunicorn
gunicorn backend.main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000

# 6. (Optional) Keep running with screen
screen -S leadgenie
gunicorn backend.main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
# Ctrl+A then D to detach
```

---

### 6.3 Deploy to Railway

Railway is the fastest zero-config deployment option.

```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login
railway login

# 3. Link to a new project
railway init

# 4. Add environment variables
railway variables set ANTHROPIC_API_KEY=sk-...
railway variables set APOLLO_API_KEY=...
railway variables set VOYAGE_API_KEY=...

# 5. Deploy
railway up
```

Add a `railway.toml` in the root:

```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "uvicorn backend.main:app --host 0.0.0.0 --port $PORT"
```

---

### 6.4 Deploy to Render

1. Go to [render.com](https://render.com) → **New Web Service**
2. Connect your GitHub repo `DataSynther/LeadGenie-AI`
3. Set:
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
4. Add environment variables in the Render dashboard (same keys as `.env.example`)
5. Click **Deploy**

Render auto-deploys on every push to `main`.

---

## Storage Layout

All persistent data lives under `backend/storage/` (gitignored):

```
backend/storage/
├── conversations/      # Per-lead conversation history  (lead_id.json)
├── audit_logs/         # Governance audit trail         (lead_id.jsonl)
└── feedback/
    └── outcomes.jsonl  # All recorded interaction outcomes
```

In production, replace local file storage with a database (Postgres + SQLAlchemy) or object store (S3) by swapping the read/write methods in `memory_manager.py`, `audit_logger.py`, and `feedback_collector.py`.
