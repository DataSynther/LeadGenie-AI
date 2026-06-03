# LeadGenie AI — Comprehensive Low-Level Design Document

---

## Table of Contents

1. [Executive System Overview](#1-executive-system-overview)
2. [Module Architecture Breakdown](#2-module-architecture-breakdown)
3. [Data Flows & Component Interactions](#3-data-flows--component-interactions)
4. [Key Tech Stack & Design Patterns](#4-key-tech-stack--design-patterns)

---

# 1. Executive System Overview

**LeadGenie AI** is an autonomous, governed, market-aware AI Sales Development Representative (SDR) platform. It replaces the manual SDR workflow with a fully orchestrated AI pipeline that discovers leads, researches companies, generates hyper-personalized outreach, governs content quality, handles multi-turn reply conversations, and continuously learns from outcomes.

## Core System Capabilities

| Capability | Description |
|---|---|
| **Lead Discovery** | Pulls and normalizes B2B leads from Apollo.io (people + company enrichment) |
| **Company Research** | Uses Claude to synthesize company signals into strategic research briefs |
| **Market Trend Intelligence** | Ingests RSS feeds + curated trends; ranks them by semantic relevance to each lead |
| **Personalized Outreach Generation** | Claude-powered email generation grounded in research, signals, and trends |
| **Multi-Layer Governance** | Tone validation → hallucination checking → risk scoring → auto-correction retry loop |
| **Conversation Handling** | Intent classification + context-aware multi-turn reply generation |
| **Memory Architecture** | Four-layer memory system (episodic, semantic, entity, short-term) with governance policies |
| **Observability** | Per-agent tracing, validation logging, retrieval scoring, self-evaluation, prompt drift detection |
| **Continuous Learning** | Feedback collection → pattern analysis → prompt guidance optimization |
| **Scheduling** | Calendly integration for meeting booking embedded in conversation responses |

## System Boundary

```
External World                    LeadGenie AI Backend                    Storage
─────────────                    ────────────────────                    ───────
Apollo.io API  ──────────────►  Services Layer                          audit_logs/
Voyage AI API  ──────────────►  Agent Pipeline                          diagnostics/
Anthropic API  ──────────────►  Governance Layer          ──────────►   feedback/
Calendly API   ──────────────►  Memory Layer                            lead_contexts/
Gmail SMTP/IMAP ─────────────►  Observability Layer                     memory/
RSS Feeds      ──────────────►  FastAPI HTTP Layer                      intent_analytics/
Frontend SPA   ──────────────►  (main.py)                               memory_governance/
```

---

# 2. Module Architecture Breakdown

---

## 2.1 Entry Points & Scripts

### `main.py` — FastAPI Application Server

The primary HTTP server exposing all platform capabilities as REST endpoints.

| Responsibility | Detail |
|---|---|
| **Application Bootstrap** | Instantiates all agents, services, and orchestrators as module-level singletons |
| **CORS Middleware** | Allows all origins for frontend SPA integration |
| **Route Definitions** | 30+ endpoints covering leads, outreach, conversation, governance, memory, observability, and pipeline lineage |
| **Pipeline Lineage Assembly** | `/pipeline/lineage/{lead_id}` reconstructs the full per-lead pipeline execution graph from audit logs + diagnostic traces |
| **Approval Queue** | `/approval-queue` returns governance-flagged emails with per-checkpoint citations and hallucination violations |
| **Inbound Webhook** | `/api/webhook/inbound-reply` receives Resend-forwarded email replies and routes to `ConversationAgent` |

**Key Endpoint Groups:**

```
/health                         → Health check
/leads/search                   → Apollo people search
/company/enrich                 → Apollo company enrichment
/outreach/generate              → Full pipeline: research → outreach → governance
/conversation/reply             → Handle inbound reply
/feedback/record                → Record outcome
/pipeline/stats                 → Real funnel metrics from traces
/pipeline/lineage/{lead_id}     → Full DAG lineage per lead
/memory/governance              → Memory policy stats
/dev/*                          → Observability developer endpoints
```

---

### `run_demo.py` — CLI Demo Runner

Executes the full pipeline sequentially for a single lead loaded from `sample_data/`. Demonstrates all 8 pipeline stages in order with console output. Used for local development validation.

### `e2e_test.py` — End-to-End Test Suite

Runs a 5-phase in-process integration test across 3 real leads:
- **Phase 1:** Full outreach pipeline with governance retry verification
- **Phase 2:** Simulated inbound replies with intent classification
- **Phase 3:** Memory layer write/read/eviction verification
- **Phase 4:** Dashboard observability data validation
- **Phase 5:** Governance retry stress testing

### `test_apollo.py` — Apollo API Smoke Test

Standalone script that directly calls Apollo's `/mixed_companies/search` and `/mixed_people/api_search` endpoints and saves results to `sample_data/`.

---

## 2.2 `services/` — External Integration Layer

### `services/apollo/` — Apollo.io Data Services

Three specialized service classes, all exported from `services/apollo/__init__.py`.

#### `ApolloPeopleService`

| Method | Responsibility |
|---|---|
| `search_people(filters)` | Search leads by title, seniority, company; returns normalized person dicts |
| `get_person_details(person_id)` | Fetch single person by ID; uses sample data in MVP mode |
| `_normalize_sample(raw)` | Maps sample JSON schema → internal person schema |
| `_normalize_apollo(raw)` | Maps live Apollo API response → internal person schema |
| `_use_sample()` | Feature flag: `True` = always use `demo_leads.json` |

**Internal Schema (normalized person):**
```python
{id, name, title, seniority, department, email, linkedin_url, organization_id, company}
```

#### `ApolloCompanyService`

| Method | Responsibility |
|---|---|
| `enrich_company(domain)` | GET `/organizations/enrich?domain=` → normalized company dict |
| `get_company_by_id(org_id)` | GET `/organizations/{id}` → normalized company dict |
| `_normalize_company(raw)` | Maps Apollo org fields → internal company schema |

**Internal Schema (normalized company):**
```python
{id, name, domain, industry, employee_count, revenue_estimate, funding_stage,
 technologies, description, headquarters, linkedin_url}
```

#### `ApolloSignalsService`

Derives hiring and growth signals from enriched company data without requiring Apollo's premium job-postings tier.

| Method | Responsibility |
|---|---|
| `detect_hiring_trends(org_id, company)` | Computes signal dict from headcount growth rates and tech stack |

**Signal computation logic:**
- `ai_hiring` = count of AI-related keywords in `technologies[]`
- `engineering_expansion` = count of engineering tech keywords in `technologies[]`
- `scaling_signal` = `growth_6m > 8%` OR `growth_12m > 15%`
- `estimated_new_hires_6m` = `employee_count × max(growth_6m, 0)`

---

### `services/email_sender.py` — Gmail SMTP Sender

| Class | Responsibility |
|---|---|
| `EmailSender` | Sends outreach emails via Gmail SMTP SSL (port 465) using app password credentials |

Reads `LEADGENIE_GMAIL` and `LEADGENIE_GMAIL_PASSWORD` from environment. Returns `{sent: bool, to: str, error: str|None}`. Gracefully degrades when credentials are absent.

---

### `services/gmail_reply_poller.py` — IMAP Reply Poller

| Class | Responsibility |
|---|---|
| `GmailReplyPoller` | Polls Gmail INBOX via IMAP4_SSL for unseen replies from known leads |

**Processing loop:**
1. Connects to `imap.gmail.com:993`
2. Searches for `UNSEEN FROM "<known_lead_email>" SUBJECT "Re:"`
3. Extracts plain-text body, strips quoted history (`>` lines)
4. Looks up lead context via `LeadContextStore`
5. Calls `ConversationAgent.handle_reply()`
6. Marks message as `\Seen`
7. Sleeps `REPLY_POLL_INTERVAL` seconds (default: 60)

---

### `services/lead_context_store.py` — Lead Context Persistence

| Class | Responsibility |
|---|---|
| `LeadContextStore` | Persists `{lead_id, context}` keyed by lead email address to `storage/lead_contexts/` |

Used to reconstruct pipeline context when an inbound reply arrives, without re-running the full research pipeline. Key format: `email@domain.com` → `email_at_domain_com.json`.

---

## 2.3 `agents/` — AI Agent Pipeline

### `agents/research/` — Company Intelligence

#### `ResearchAgent`

| Method | Responsibility |
|---|---|
| `research_company(company, signals, lead_id)` | Calls Claude with structured company + signals data; returns research brief JSON |
| `detect_pain_points(context)` | Extracts `likely_pain_points` from existing context dict |

**Claude output schema:**
```json
{
  "summary": "...",
  "growth_stage": "scale-up|growth|early-stage",
  "strategic_priorities": ["..."],
  "likely_pain_points": ["..."],
  "ai_readiness_score": 0-10
}
```

Wraps the Claude call in `AgentTracer` with `prompt_version="research_v1"`. Runs `Validator("research")` on output and attaches self-evaluation.

#### `ContextBuilder`

| Method | Responsibility |
|---|---|
| `build_lead_context(lead, company, signals, research)` | Assembles the canonical `context` dict used by all downstream agents |
| `identify_growth_stage(company)` | Rule-based growth stage classification from employee count + funding stage |

**Output context schema:**
```python
{
  "lead":     {name, title, seniority, department, linkedin_url},
  "company":  {name, industry, employee_count, funding_stage, technologies, description},
  "signals":  {open_roles, ai_hiring, scaling},
  "research": {summary, growth_stage, pain_points, ai_readiness_score, strategic_priorities}
}
```

---

### `agents/trends/` — Market Trend Intelligence

#### `TrendAgent`

| Method | Responsibility |
|---|---|
| `get_current_trends()` | Returns trends from `trend_store.json`; calls `ingest_trends()` if empty |
| `ingest_trends()` | Fetches RSS feeds (VentureBeat, TechCrunch) + merges with `CURATED_TRENDS` list |
| `_save(trends)` | Persists trend list to `trend_store.json` |

**Trend schema:**
```python
{id, title, category, relevance_tags: [], source, date, summary?}
```

Curated trends cover: AI governance, AI agents, Snowflake AI, cost optimization, AI infrastructure funding.

---

### `agents/relevance/` — Semantic Trend Ranking

#### `RelevanceEngine`

| Method | Responsibility |
|---|---|
| `rank_trends(context, trends, top_k)` | Embeds context + all trend texts; returns top-k by cosine similarity |
| `score_relevance(context, trend)` | Single trend relevance score |
| `_context_to_text(context)` | Flattens context dict to a single text string for embedding |

#### `EmbeddingService`

| Method | Responsibility |
|---|---|
| `embed_text(text)` | Single text → embedding vector |
| `batch_embed(texts)` | Batch texts → embedding vectors (one Voyage AI call) |
| `cosine_similarity(a, b)` | NumPy dot-product cosine similarity with dimension padding |
| `_voyage_embed(texts)` | Voyage AI API call with exponential backoff (4 retries, 22s base sleep) |
| `_fallback_embed(texts)` | TF-IDF bag-of-words fallback when Voyage AI is unavailable |

**Rate limit handling:** Free tier = 3 RPM. Retry schedule: 22s → 44s → 88s → 176s.

---

### `agents/outreach/` — Email Generation

#### `OutreachAgent`

| Method | Responsibility |
|---|---|
| `generate_email(context, top_trends)` | Full email generation with internal 3-attempt auto-correction loop |
| `generate_single(context, top_trends, correction_note, attempt)` | Single Claude call; used by `GovernanceOrchestrator` |
| `generate_follow_up(context, conversation_summary)` | Follow-up email from conversation history |
| `respond_to_objection(context, objection)` | Objection reframe response |
| `_build_citations(context, top_trends)` | Builds source attribution map for every fact used |
| `_build_correction_prompt(issues, attempt)` | Converts validation issues into targeted correction instructions |

**Claude output schema:**
```json
{"subject": "...", "body": "...", "reasoning": "..."}
```

Every call is wrapped in `AgentTracer` with `prompt_version="outreach_email_v1"`. Attaches: retrieval score, self-evaluation, citations, attempt info.

#### `prompt_templates.py`

Three prompt templates as module-level string constants:

| Template | Purpose |
|---|---|
| `INITIAL_EMAIL_TEMPLATE` | Cold outreach — 3-4 sentence email with trend hook |
| `FOLLOW_UP_TEMPLATE` | Non-pushy follow-up referencing prior exchange |
| `OBJECTION_RESPONSE_TEMPLATE` | Empathetic objection reframe |

---

### `agents/conversation/` — Multi-Turn Conversation Handling

#### `ConversationAgent`

| Method | Responsibility |
|---|---|
| `handle_reply(lead_id, reply, context, lead_email)` | Full reply processing: store → classify intent → route → respond → optionally send email |
| `_route(lead_id, reply, intent, context)` | Dispatches to intent-specific handler |
| `_system_prompt(context, intent)` | Builds intent-specific Claude system prompt with full company context |
| `_build_messages(history_summary)` | Constructs multi-turn message array for Claude |
| `_send_email(lead_email, ...)` | Sends reply via `EmailSender` |

**Intent routing table:**

| Intent | Handler |
|---|---|
| `unsubscribe` | Hardcoded opt-out message; no email sent |
| `meeting_request` | Hardcoded Calendly URL response |
| `objection` | `OutreachAgent.respond_to_objection()` |
| `interested` / `neutral` / `fact_question` | Claude with context-grounded system prompt |

#### `IntentDetector`

| Method | Responsibility |
|---|---|
| `classify(reply, lead_id, context)` | Claude call → one of 6 valid intents + confidence + key_signal + reasoning |
| `_log_event(reply, classification, lead_id, context)` | Appends event to `storage/intent_analytics/events.jsonl` |
| `get_summary()` | Aggregate intent counts, avg confidence, top signals per intent |
| `get_events(intent, lead_id)` | Filtered event retrieval |

**Valid intents:** `interested`, `objection`, `fact_question`, `neutral`, `meeting_request`, `unsubscribe`

#### `MemoryManager`

Facade exposing the four-layer memory system. All reads/writes pass through `MemoryGo