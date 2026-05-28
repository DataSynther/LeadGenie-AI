# LeadGenie AI — Governed Adaptive AI SDR Platform

> A governed, market-aware, autonomous AI sales development platform that identifies high-intent leads, generates adaptive personalized outreach, handles conversations, and maintains full explainability and auditability.

---

## Problem Statement

Existing SDR workflows force teams to choose between slow manual prospecting and ungoverned AI automation — leading to lead decay, weaker engagement, lost sales momentum, and increasing brand risk.

**AI outreach today is fast, but rarely contextual, adaptive, or governed.**

---

## What This System Does

| Capability           | Description                                             |
| -------------------- | ------------------------------------------------------- |
| Lead Intelligence    | Fetch and enrich leads via Apollo                       |
| Company Intelligence | Industry, funding, tech stack, description              |
| Signal Intelligence  | Hiring trends, AI expansion, scaling signals            |
| Trend Intelligence   | Market trends, RSS news, curated AI signals             |
| Semantic Relevance   | Embedding-based trend ranking per lead context          |
| Adaptive Outreach    | Claude-powered personalized email generation            |
| Conversation Agent   | Autonomous multi-turn reply and objection handling      |
| Governance Engine    | Tone validation, hallucination checks, risk scoring     |
| Audit Lineage        | Immutable per-lead audit trail for all decisions        |
| Continuous Learning  | Feedback-driven pattern analysis and prompt improvement |
| Meeting Scheduling   | Calendly integration for one-click booking              |

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

## End-to-End Setup & Demo

### Prerequisites

| Requirement | Mac                   | Windows                                          |
| ----------- | --------------------- | ------------------------------------------------ |
| Python 3.9+ | `brew install python` | Download from [python.org](https://python.org)   |
| Git         | `brew install git`    | Download from [git-scm.com](https://git-scm.com) |
| pip         | Included with Python  | Included with Python                             |

---

### Mac

```bash
# 1. Clone the repo
git clone https://github.com/DataSynther/LeadGenie-AI.git
cd LeadGenie-AI

# 2. Create and activate a virtual environment
python3 -m venv venv
source venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure environment
cp .env.example .env
# Open .env and fill in your API keys (see API Keys section below)

# 5. Run the end-to-end demo
python3 run_demo.py

# 6. (Optional) Start the backend API
uvicorn backend.main:app --reload --port 8000
```

---

### Windows

```powershell
# 1. Clone the repo
git clone https://github.com/DataSynther/LeadGenie-AI.git
cd LeadGenie-AI

# 2. Create and activate a virtual environment
python -m venv venv
venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure environment
copy .env.example .env
# Open .env in Notepad or VS Code and fill in your API keys

# 5. Run the end-to-end demo
python run_demo.py

# 6. (Optional) Start the backend API
uvicorn backend.main:app --reload --port 8000
```

```
### FE Setup

cd frontend

npm i

npm run dev

```

---

### API Keys Required

Open `.env` and fill in the following:

| Key                 | Where to get it                                                      |
| ------------------- | -------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com)               |
| `APOLLO_API_KEY`    | [apollo.io](https://app.apollo.io) → Settings → API Keys             |
| `VOYAGE_API_KEY`    | [voyageai.com](https://voyageai.com)                                 |
| `RESEND_API_KEY`    | [resend.com](https://resend.com) → API Keys                          |
| `FROM_EMAIL`        | Your verified sender email (use `onboarding@resend.dev` for testing) |

---

### What the Demo Does

Running `run_demo.py` executes the full 8-step pipeline against the first lead in `sample_data/demo_leads.json`:

```
Step 1 — Research Agent       → Company intelligence + pain points
Step 2 — Context Builder      → Unified lead + company context
Step 3 — Trend Intelligence   → Load current market trends
Step 4 — Relevance Engine     → Rank trends by semantic similarity
Step 5 — Outreach Generation  → Personalized email via Claude
Step 6 — Governance Check     → Hallucination + risk scoring
Step 7 — Feedback             → Record outcome
Step 8 — Send Email           → Deliver via Resend API
```

---

### (Optional) Run with Docker

```bash
docker-compose up --build
```

---

## API Endpoints

| Method | Endpoint                  | Description                      |
| ------ | ------------------------- | -------------------------------- |
| POST   | `/leads/search`           | Search leads by domain + persona |
| GET    | `/company/enrich?domain=` | Enrich company data              |
| POST   | `/outreach/generate`      | Full pipeline → governed email   |
| POST   | `/conversation/reply`     | Handle inbound reply             |
| POST   | `/feedback/record`        | Record outcome                   |
| GET    | `/learning/analytics`     | View performance metrics         |
| GET    | `/trends`                 | Get current market trends        |
| GET    | `/audit/{lead_id}`        | View audit trail for a lead      |

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
