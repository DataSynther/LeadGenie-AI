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
   - [Observability Layer (Phase 1)](#210-observability-layer-phase-1)
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
# venv\Scripts\activate         # Windows

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
from backend.services.apollo import ApolloPeopleService, ApolloCompanyService, ApolloSignalsService

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

**What it does:** Calls Claude with the unified lead context, top relevant trends, and sender KB claims to generate personalized, constrained outreach emails. Uses a two-phase flow: a free `/outreach/suggest` call first detects the best vertical + domain, the user confirms or overrides, then the paid `/outreach/generate` call runs.

#### Files

| File | Class | Key Methods |
|---|---|---|
| `outreach_agent.py` | `OutreachAgent` | `generate_single()`, `generate_follow_up()`, `respond_to_objection()`, `fix_shape()` |
| `prompt_templates.py` | — | `build_scaffold_template()`, per-stream scaffold with `{kb_section}` slot |
| `template_categorizer.py` | `TemplateCategorizer`, `DomainDetector` | Keyword + Haiku LLM classification |

#### Vertical × Domain taxonomy

Verticals (lead job role): `data_science` · `data_engineering` · `product` · `devops` · `generic`

Domains (company industry): `fintech` · `healthcare` · `ecommerce` · `saas` · `logistics` · `telecom` · `media` · `manufacturing` · `generic`

#### Two-phase flow

```
POST /outreach/suggest  (free, ~1s)
  → detects vertical + domain, returns options for UI chip selector

User confirms or overrides vertical/domain

POST /outreach/generate  (paid, ~45-60s)
  → generates email with vertical_override + domain_override
```

#### Sender intro

Every email body begins with a fixed sender introduction prepended in `_assemble_body()`:

> *"I'm Prashant Biswas from Ganit. We are a full-stack Data & AI company, recognized by Everest, Forrester, and Analytics India."*

This is hardcoded and cannot be overridden by Claude.

#### Usage

```python
from backend.agents.outreach.outreach_agent import OutreachAgent

agent = OutreachAgent()

# Generate initial cold email (with optional vertical/domain overrides)
email = agent.generate_single(context, top_trends,
                              vertical_override="data_engineering",
                              domain_override="fintech")
# Returns: {subject, opening_hook, value_prop, social_proof, cta, reasoning,
#           stream, domain, kb_ids_used, body}

# Generate follow-up
follow_up = agent.generate_follow_up(context, conversation_summary="They opened but didn't reply.")
# Returns: {subject, body}

# Handle an objection
response = agent.respond_to_objection(context, "We already have a solution for this.")
# Returns: {response_text, approach_used}
```

#### Customising Prompt Templates

Edit `prompt_templates.py` → `_SCAFFOLD_BASE` and `_STREAM_CONTEXTS`. Template variables use `{variable_name}` format. `build_scaffold_template(stream, few_shot_section, kb_section)` injects stream context and KB claims before `str.format()` so curly braces in injected content are safe.

---

### 2.5a Sender Knowledge Base

**Location:** `backend/memory/sender_kb.py` · `backend/storage/knowledge_base/`

**What it does:** Holds Ganit's verified case-study proof points (Domain B facts). Retrieved per-generation and injected into the scaffold prompt so Claude cites real metrics rather than inventing them.

#### Knowledge base files

| File | Records | Coverage |
|---|---|---|
| `data_science.jsonl` | 31 | BFSI fraud detection, insurance claims, semiconductor AOI, CPG ML |
| `data_engineering.jsonl` | 8 | Databricks→EMR cost cut, data lake migrations, pipeline automation |
| `generic.jsonl` | 6 | SOC-2/ISO certs, Everest/Forrester/PeMa recognition, AWS 6yr partner, 300+ team |

#### Retrieval scoring

Each record is scored against 5 signals (sum ≤ 1.0):

| Signal | Weight |
|---|---|
| vertical match (`vertical == stream`) | 0.40 |
| domain match (`domain == company domain`) | 0.30 |
| technology overlap (0.10 per match, max 2) | 0.20 |
| generic bonus (record is `domain=generic`) | 0.05 |
| trend tag overlap (0.05 per match, max 2) | 0.10 |

#### Usage

```python
from memory.sender_kb import SenderKnowledgeBase

kb = SenderKnowledgeBase()

# Top 3 records for a data_engineering lead at a fintech company using Databricks
claims = kb.retrieve(
    vertical="data_engineering",
    domain="fintech",
    technologies=["databricks", "snowflake"],
    trend_tags=["cost", "migration"],
    n=3,
)

# Get formatted text block for prompt injection
text = kb.get_claims_text([r["id"] for r in claims])
```

#### Adding new KB records

Append a JSON line to the relevant `.jsonl` file under `backend/storage/knowledge_base/`:

```json
{"id": "de_fintech_cs_003", "vertical": "data_engineering", "domain": "fintech",
 "claim": "Reduced Snowflake spend by 40% for a mid-size bank by optimising clustering keys.",
 "technologies": ["snowflake"], "tags": ["cost", "fintech"]}
```

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
| `orchestrator.py` | `GovernanceOrchestrator` | Retry loop (validator + tone), then single hallucination check |
| `risk_engine.py` | `RiskEngine` | Orchestrates all checks, computes risk score, logs decision |
| `tone_validator.py` | `ToneValidator` | Rule-based: banned phrases, subject length, sentence count, exclamation marks |
| `hallucination_checker.py` | `HallucinationChecker` | Claude verifies no fabricated claims vs source facts + KB claims |
| `audit_logger.py` | `AuditLogger` | Writes/reads immutable JSONL audit events per lead |

#### Three-domain fact boundary

| Domain | What it is | Rule |
|---|---|---|
| **A — Prospect facts** | Apollo + Research Agent output | Read only — never invent |
| **B — Sender KB claims** | `backend/storage/knowledge_base/` records | Cite exactly — include the metric verbatim |
| **C — Generative content** | Transitions, framing, CTA prose | Write freely |

#### Hallucination checker — KB awareness

When Claude returns `kb_ids_used` in the email JSON, the orchestrator fetches those claim texts from `SenderKnowledgeBase` and adds them to `source_facts` as `sender_kb_claims` before calling `HallucinationChecker`. This prevents verified sender proof points (Domain B) from being incorrectly flagged as fabrications.

#### Human-in-loop re-check

Every generated email lands in the approval queue. If hallucination violations are detected, the reviewer can edit the email and trigger a re-check at:

```
POST /approval-queue/{event_id}/recheck-hallucination
```

Re-checks cost 1 credit each. The system is seeded with 50 credits.

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

## Running End-to-End (All Services)

### 1. Start backend

```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Start frontend

```bash
cd frontend
npm run dev
# Open http://localhost:5173
```

### 3. Start Gmail reply poller (optional — for live email loop)

```bash
python3 scripts/run_reply_poller.py
```

### 4. Seed observability data (optional — for dev dashboard)

Run any conversation reply call to populate traces:

```bash
curl -s -X POST http://localhost:8000/conversation/reply \
  -H "Content-Type: application/json" \
  -d '{
    "lead_id": "test-001",
    "reply": "What results have you seen for companies at our scale?",
    "context": {
      "lead": {"name": "Ravi Kumar", "title": "VP Data", "email": "ravi@co.com"},
      "company": {"name": "Acme Corp", "industry": "SaaS", "employee_count": 300},
      "research": {
        "summary": "Mid-stage SaaS scaling data function",
        "pain_points": ["data pipeline latency", "ML deployment"],
        "growth_stage": "growth",
        "ai_readiness_score": 7
      },
      "signals": {"scaling": true}
    }
  }'
```

Then open `http://localhost:5173/dev` to see the live dashboard.

### 5. Run existing tests

```bash
cd backend
python3 -m pytest ../tests/ -v
```

### 6. Test observability layer in isolation

```bash
cd backend
python3 -c "
from observability.agent_tracer import AgentTracer, score_context_completeness, score_prompt_ambiguity
from observability.validator import Validator
from observability.diagnostic_store import get_diagnostics_summary, get_agent_metrics

# Context scoring
full_ctx = {
    'lead': {'name': 'Ravi', 'title': 'VP', 'email': 'r@co.com'},
    'company': {'name': 'Acme', 'industry': 'SaaS', 'employee_count': 200},
    'research': {'summary': 'Fast growing', 'pain_points': ['latency'], 'growth_stage': 'growth'},
    'signals': {'scaling': True},
}
print('Context score (full):', score_context_completeness(full_ctx))
print('Context score (empty):', score_context_completeness({}))

# Prompt ambiguity scoring
print('Ambiguity (vague):', score_prompt_ambiguity('if appropriate maybe include something like a CTA'))
print('Ambiguity (clear):', score_prompt_ambiguity('Generate a cold email for Ravi at Acme about data pipeline latency.'))

# Validator
v = Validator('outreach', lead_id='test', context=full_ctx)
r1 = v.validate({'subject': 'Hey Ravi', 'body': 'We help Acme reduce data pipeline latency.'})
r2 = v.validate({'subject': '', 'body': ''})
print('Valid output:', r1['consequence'])   # allow
print('Empty output:', r2['consequence'])   # block

print('All checks passed')
"
```

---

## Storage Layout (updated)

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

### 2.10 Observability Layer (Phase 1)

**Location:** `backend/observability/`
**Branch:** `feature/governed-dashboard-phase1`

**What it does:** Wraps every Claude agent call to collect latency, context quality, prompt clarity, and validation outcomes — then surfaces everything on the developer dashboard at `/dev`.

#### Files

| File | Class / Functions | Purpose |
|---|---|---|
| `diagnostic_store.py` | `write_trace()`, `write_validation()`, `get_agent_metrics()`, `get_diagnostics_summary()` | JSONL persistence + query helpers |
| `agent_tracer.py` | `AgentTracer` (context manager), `score_context_completeness()`, `score_prompt_ambiguity()` | Instruments every Claude call |
| `validator.py` | `Validator` | Shape / context / policy / business rule checks → allow / block / defer |

#### The 5 diagnostic categories

| Category | Fires when |
|---|---|
| `retrieval_failure` | Retrieval score provided and `< 0.55` |
| `insufficient_context` | Context completeness score `< 0.50` (required fields null or missing) |
| `ambiguous_prompt` | Prompt ambiguity score `> 0.30` (vague language density) |
| `validation_gap` | Validator was not called inside the tracer `with` block |
| `task_model_mismatch` | Model confidence `< 0.65` |

#### Usage pattern

```python
from observability.agent_tracer import AgentTracer
from observability.validator import Validator

tracer = AgentTracer(
    agent="my_agent",
    lead_id=lead_id,
    context=context,
    retrieval_score=relevance_score,   # optional: from relevance engine
    prompt_version="my_agent_v1",
)

with tracer.trace(prompt=prompt, system=system_prompt) as t:
    response = client.messages.create(model=MODEL, ...)
    result = parse_json_response(response)
    t.finish(response, confidence=result.get("confidence"))
    # Validator MUST be inside the with block
    Validator("my_agent", lead_id=lead_id, context=context).validate(result, tracker=t)
```

#### Validation consequences

| Consequence | When | Effect |
|---|---|---|
| `allow` | All checks pass | Safe to proceed |
| `block` | Shape check fails (malformed output) | Output unusable — do not use downstream |
| `defer` | Context or policy check fails | Queue for human review |

#### Dev endpoints

```bash
# Diagnostic summary — 5 categories with counts and recent events
curl http://localhost:8000/dev/diagnostics

# Per-agent metrics
curl http://localhost:8000/dev/agent-metrics

# Recent traces (last 50 by default)
curl http://localhost:8000/dev/traces?limit=20

# Recent validation events
curl http://localhost:8000/dev/validation-log?limit=20
```

#### Developer Dashboard

The dashboard is at `http://localhost:5173/dev` and auto-refreshes every 10 seconds. It shows 6 panels (see `frontend/src/pages/DevDashboardPage.tsx`):
- **Hallucination Root Cause** — 5-category grid
- **AI Operations** — per-agent table
- **Governance & Validation** — allow/block/defer breakdown + live feed
- **Retrieval & Prompt Intelligence** — context coverage bars + prompt version tracking
- **System Insights** — latency bottleneck chart + token cost (Sonnet 4.6 blended rate)
- **Live Trace Feed** — last 20 calls with diagnostic chips

---

## 3. Running the API Server

```bash
# Activate your virtual environment first
source venv/bin/activate

# Start the FastAPI server with live reload
cd backend
uvicorn main:app --reload --port 8000
```

### Where to access everything

| What | URL |
|---|---|
| **AI Observability Dashboard** | http://localhost:5173/dev |
| **Lead Discovery** | http://localhost:5173/discover |
| **Mission Control (Dashboard)** | http://localhost:5173/dashboard |
| **Pipeline** | http://localhost:5173/pipeline |
| **Approval Queue** | http://localhost:5173/approval |
| **Conversations** | http://localhost:5173/conversations |
| **Audit Trail** | http://localhost:5173/audit |
| **Backend API (Swagger UI)** | http://localhost:8000/docs |
| **Backend API (ReDoc)** | http://localhost:8000/redoc |

> **Note:** The frontend must be started separately — `cd frontend && npm run dev`. The AI Observability Dashboard at `/dev` auto-populates once any agent call is made (e.g. `POST /conversation/reply`).

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

### `POST /outreach/suggest`

Free pre-generation call (~1 s, no Claude). Detects the best vertical and domain for a lead using keyword rules (Haiku LLM fallback for ambiguous industries). Call this before `/outreach/generate` to show the user a chip selector.

```bash
curl -X POST http://localhost:8000/outreach/suggest \
  -H "Content-Type: application/json" \
  -d '{
    "lead_id": "apollo_lead_id_here",
    "company_domain": "acme.com"
  }'
```

**Response:**
```json
{
  "vertical": "data_engineering",
  "domain": "fintech",
  "vertical_options": ["data_engineering", "data_science", "devops", "product", "generic"],
  "domain_options":   ["fintech", "saas", "healthcare", "ecommerce", "logistics", "telecom", "media", "manufacturing", "generic"],
  "top_trends": [{ "title": "...", "relevance_score": 0.91 }]
}
```

---

### `POST /outreach/generate`

Full pipeline: enriches lead → builds context → ranks trends → retrieves KB claims → generates governed email.

```bash
curl -X POST http://localhost:8000/outreach/generate \
  -H "Content-Type: application/json" \
  -d '{
    "lead_id": "apollo_lead_id_here",
    "company_domain": "acme.com",
    "vertical_override": "data_engineering",
    "domain_override": "fintech"
  }'
```

`vertical_override` and `domain_override` are optional. If omitted, the engine auto-detects them.

**Response includes:**
- `lead` — normalized lead data
- `company` — enriched company data
- `top_trends` — top 3 semantically relevant trends
- `email` — `subject`, `body` (always starts with sender intro), `opening_hook`, `value_prop`, `social_proof`, `cta`, `reasoning`, `stream`, `domain`, `kb_ids_used`
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

### `GET /dev/diagnostics`

5-category hallucination diagnostic summary with counts and last 5 events per category.

```bash
curl http://localhost:8000/dev/diagnostics
```

Response shape:
```json
{
  "total_traces": 47,
  "by_category": {
    "retrieval_failure": { "count": 2, "label": "Retrieval Failure", "description": "...", "recent_events": [...] },
    "insufficient_context": { "count": 5, ... },
    "ambiguous_prompt": { "count": 1, ... },
    "validation_gap": { "count": 0, ... },
    "task_model_mismatch": { "count": 3, ... }
  }
}
```

---

### `GET /dev/agent-metrics`

Per-agent aggregated stats.

```bash
curl http://localhost:8000/dev/agent-metrics
```

Response shape:
```json
{
  "intent":       { "total_calls": 12, "success_rate": 1.0, "avg_latency_ms": 2340, "avg_tokens": 291, "avg_confidence": 0.93, "validation": { "allow": 11, "block": 0, "defer": 1, "pass_rate": 0.917 } },
  "conversation": { "total_calls": 8,  "success_rate": 1.0, "avg_latency_ms": 6200, "avg_tokens": 510, "avg_confidence": null, "validation": { "allow": 8, "block": 0, "defer": 0, "pass_rate": 1.0 } },
  "outreach":     { "total_calls": 5,  "success_rate": 1.0, "avg_latency_ms": 8100, "avg_tokens": 440, "avg_confidence": null, "validation": { "allow": 4, "block": 1, "defer": 0, "pass_rate": 0.8 } },
  "research":     { "total_calls": 5,  "success_rate": 1.0, "avg_latency_ms": 3500, "avg_tokens": 310, "avg_confidence": null, "validation": { "allow": 5, "block": 0, "defer": 0, "pass_rate": 1.0 } }
}
```

---

### `GET /dev/traces`

Recent agent call traces with all diagnostic metadata.

```bash
curl "http://localhost:8000/dev/traces?limit=10"
```

---

### `GET /dev/validation-log`

Recent validation events.

```bash
curl "http://localhost:8000/dev/validation-log?limit=10"
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

# Step 10 — Inspect observability data (all auto-populated by agents)
import requests

# See per-agent metrics
metrics = requests.get("http://localhost:8000/dev/agent-metrics").json()
print("Research success rate:", metrics["research"]["success_rate"])
print("Outreach avg latency:", metrics["outreach"]["avg_latency_ms"], "ms")

# See diagnostic breakdown
diag = requests.get("http://localhost:8000/dev/diagnostics").json()
print("Total traces:", diag["total_traces"])
for cat, data in diag["by_category"].items():
    if data["count"] > 0:
        print(f"  {data['label']}: {data['count']} events")
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

## Storage Layout (updated)

All persistent data lives under `backend/storage/` (gitignored):

```
backend/storage/
├── audit_logs/             # Governance audit trail         (lead_id.jsonl)
├── conversations/          # Per-lead conversation history  (lead_id.json)
├── diagnostics/            # Observability layer (Phase 1)
│   ├── traces.jsonl        # One line per Claude call
│   └── validations.jsonl   # One line per validation event
├── feedback/
│   └── outcomes.jsonl      # All recorded interaction outcomes
├── industry_memory/        # Few-shot outreach examples by vertical
│   └── *.jsonl
├── intent_analytics/
│   └── events.jsonl        # Intent classification events
├── knowledge_base/         # Sender proof-point KB (Domain B)
│   ├── data_science.jsonl  # 31 records — ML/AI case studies
│   ├── data_engineering.jsonl  # 8 records — pipeline/lakehouse
│   └── generic.jsonl       # 6 records — certs, awards, differentiators
└── lead_contexts/          # Email → lead context map (sanitized_email.json)
```

In production (Phase 2 / AWS): replace file-based JSONL reads/writes with a database (Postgres or DynamoDB). The write/read boundary is in:
- `diagnostic_store.py` → `_append()` and `_read_all()`
- `audit_logger.py` → `_write()` and `get_audit_trail()`
- `memory_manager.py` → `store_message()` and `get_history()`
- `feedback_collector.py` → `record_outcome()`

In production, replace local file storage with a database (Postgres + SQLAlchemy) or object store (S3) by swapping the read/write methods in `memory_manager.py`, `audit_logger.py`, and `feedback_collector.py`.
