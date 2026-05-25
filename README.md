# LeadGenie AI — Governed Adaptive AI SDR Platform

> A governed, market-aware, autonomous AI sales development platform that identifies high-intent leads, generates adaptive personalized outreach, handles conversations, and maintains full explainability and auditability.

---

## Problem Statement

Existing SDR workflows force teams to choose between slow manual prospecting and ungoverned AI automation — leading to lead decay, weaker engagement, lost sales momentum, and increasing brand risk.

**AI outreach today is fast, but rarely contextual, adaptive, or governed.**

---

## What This System Does

| Capability | Description |
|---|---|
| Lead Intelligence | Fetch and enrich leads via Apollo |
| Company Intelligence | Industry, funding, tech stack, description |
| Signal Intelligence | Hiring trends, AI expansion, scaling signals |
| Trend Intelligence | Market trends, RSS news, curated AI signals |
| Semantic Relevance | Embedding-based trend ranking per lead context |
| Adaptive Outreach | Claude-powered personalized email generation |
| Conversation Agent | Autonomous multi-turn reply and objection handling |
| Governance Engine | Tone validation, hallucination checks, risk scoring |
| Audit Lineage | Immutable per-lead audit trail for all decisions |
| Continuous Learning | Feedback-driven pattern analysis and prompt improvement |
| Meeting Scheduling | Calendly integration for one-click booking |

---

## Architecture

```
Lead Discovery
      ↓
Context & Signal Intelligence (Apollo)
      ↓
Trend Intelligence (RSS + Curated)
      ↓
Semantic Relevance Engine (Voyage AI Embeddings)
      ↓
Adaptive Outreach Generation (Claude)
      ↓
Governance Validation (Tone + Hallucination + Risk Score)
      ↓
Autonomous Conversations (Claude + Memory)
      ↓
Meeting Scheduling (Calendly)
      ↓
Continuous Learning (Feedback → Pattern Analysis)
```

---

## Repo Structure

```
LeadGenie-AI/
├── backend/
│   ├── services/apollo/        # Lead, company, signal data from Apollo
│   ├── agents/
│   │   ├── research/           # Company research + context building
│   │   ├── trends/             # Market trend ingestion and storage
│   │   ├── relevance/          # Semantic embedding-based ranking
│   │   ├── outreach/           # Email generation + prompt templates
│   │   └── conversation/       # Multi-turn conversation + memory
│   ├── governance/             # Risk scoring, hallucination, tone, audit
│   ├── learning/               # Feedback collection + pattern learning
│   ├── scheduling/             # Calendly integration
│   ├── storage/                # Local persistence (conversations, audit, feedback)
│   └── main.py                 # FastAPI application entry point
├── frontend/                   # UI (Lead Discovery, Outreach, Governance views)
├── docs/
│   └── demo-flow.md            # End-to-end pipeline walkthrough
├── sample_data/                # Sample lead and company JSON
├── docker-compose.yml
├── requirements.txt
└── .env.example
```

---

## Quickstart

```bash
# 1. Clone
git clone https://github.com/DataSynther/LeadGenie-AI.git
cd LeadGenie-AI

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment
cp .env.example .env
# Fill in your API keys in .env

# 4. Run the backend
uvicorn backend.main:app --reload --port 8000

# 5. (Optional) Run with Docker
docker-compose up --build
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/leads/search` | Search leads by domain + persona |
| GET | `/company/enrich?domain=` | Enrich company data |
| POST | `/outreach/generate` | Full pipeline → governed email |
| POST | `/conversation/reply` | Handle inbound reply |
| POST | `/feedback/record` | Record outcome |
| GET | `/learning/analytics` | View performance metrics |
| GET | `/trends` | Get current market trends |
| GET | `/audit/{lead_id}` | View audit trail for a lead |

---

## Governance Model

Every piece of generated content passes through three layers before being sent:

1. **Tone Validator** — bans salesy phrases, enforces length limits
2. **Hallucination Checker** — Claude verifies claims against source facts
3. **Risk Engine** — computes composite risk score (0.0–1.0), auto-approves below 0.4

All decisions are written to an immutable JSONL audit log per lead.

---

## Key Dependencies

- [Anthropic Claude](https://anthropic.com) — outreach generation, research, hallucination checking
- [Apollo.io](https://apollo.io) — lead and company intelligence
- [Voyage AI](https://voyageai.com) — text embeddings for semantic relevance
- [Calendly](https://calendly.com) — meeting scheduling
- [FastAPI](https://fastapi.tiangolo.com) — backend API framework

---

## Positioning

> A governed adaptive AI revenue orchestration platform that continuously personalizes engagement using contextual intelligence, market trends, semantic relevance scoring, and explainable autonomous workflows.
