# LeadGenie AI — Update Document

---

## Session: 2026-06-08 — FinOps Dashboard + AWS V2 Deployment

**Branch:** `aws/deploy-v2` (deploy target) · `av-alen-endtoend-final` (feature work)

### FinOps Dashboard (`FinOpsDashboardPage.tsx`)

- **OutreachCostTrendChart** — Y-axis changed from raw daily cost to **avg cost per outreach email per day** (total cost ÷ outreach `success_calls`). Added **red dotted retry cost line** per day.
- **SystemCostToSuccessChart** — rebalanced 4-column grid to `[110px_1fr_1fr_1fr]` (equal thirds for middle cols). No Retry / 2 Retries legend moved tight to pie chart (removed `flex-1` stretch). Pies enlarged to 130px.
- **`api.ts`** — `FinOpsDailyEntry` extended with `retry_calls?: number` and `retry_cost_usd?: number`.
- **`finops_store.py`** — tracks `retry_cost` per agent per day; exports `retry_calls` and `retry_cost_usd` in `agent_daily_series`.

### AWS Architecture Diagrams

Generated and committed to `docs/architecture/`:
- `aws_v1_demo.{png,svg,py}` — serverless Lambda architecture (no ECS, ~$1.50 for 3-day test)
- `aws_v2_production.{png,svg,py}` — ECS Fargate production architecture (~$14 for 3-day test)
- Source files are Diagrams-as-Code (Python) — re-run to regenerate.

### AWS V2 Deployment Infrastructure (`infrastructure/`, `aws/deploy-v2` branch)

**GitHub Actions** (`.github/workflows/deploy-v2.yml`):
- OIDC auth (no stored AWS keys in GitHub)
- Build + push API and Worker Docker images to ECR
- CDK deploy all 5 stacks (VPC → Data → Compute → Frontend → Monitoring)
- React SPA sync to S3 + CloudFront cache invalidation
- Rolling ECS service update with stability wait
- Smoke test → SNS success/failure notification
- Manual `destroy` trigger for full teardown

**CDK Stacks:**

| Stack | Resources |
|---|---|
| `VpcStack` | VPC, 2 AZs, 1 NAT, security groups |
| `DataStack` | RDS Postgres Multi-AZ + pgvector, ElastiCache Redis, DynamoDB ×2, S3, Secrets Manager |
| `ComputeStack` | ECS cluster, API Fargate service (2 tasks), Worker Fargate Spot (0–8), ALB, SQS |
| `FrontendStack` | CloudFront + S3, `/api/*` proxied to ALB |
| `MonitoringStack` | CloudWatch alarms, SNS, AWS Budget ($30/mo), sleep/wake Lambdas, EventBridge |

**Auto-Sleep mechanism:**
- `ActivityTrackerMiddleware` — FastAPI middleware writes `last_activity` to DynamoDB on every non-health request (rate-limited to 1 write/60s)
- `sleep_checker` Lambda — EventBridge fires every 5 min; if idle > 15 min → scale ECS to 0 → SNS email alert with wake URL
- `wake` Lambda — API Gateway `GET` endpoint; scales services to 2+1, returns animated HTML "Waking up…" page that auto-refreshes every 20s

**CloudWatch alerts:** service sleeping, high CPU (>80%), error rate spike (>10 5xx/5min), AWS budget at 50% and 90%.

### Quick start (local)

```bash
# Terminal 1
cd backend && uvicorn main:app --reload --port 8000

# Terminal 2
cd frontend && VITE_API_URL=http://localhost:8000 npm run dev
```

| Service | URL |
|---|---|
| UI (Mission Control) | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| API docs | http://localhost:8000/docs |

> **Note:** Requires Python 3.10+ (uses `X | None` union type syntax). System Python 3.9 on macOS will fail — use `/usr/local/bin/python3.14` or install 3.11+.

---

## Session: 2026-06-03 — Memory architecture, dashboard live data, UI sync, E2E test suite, embedding fallback

---

## Dashboard Endpoints

| Environment | URL |
|-------------|-----|
| **Frontend (dev)** | `http://localhost:5173` |
| **Backend API** | `http://localhost:8000` |
| **API docs (Swagger)** | `http://localhost:8000/docs` |

**Start commands:**

```bash
# Terminal 1 — Backend
cd LeadGenie-AI/backend
uvicorn main:app --reload --port 8000

# Terminal 2 — Frontend
cd LeadGenie-AI/frontend
npm run dev          # opens http://localhost:5173
```

**Key dashboard pages:**

| Page | Route |
|------|-------|
| Command Center (main dashboard) | `/command-center` |
| Pipeline Lineage | `/lineage` |
| Pipeline Lineage for specific lead | `/lineage?lead=<lead_id>` |
| Dev Observability | `/dev` |
| Approval Queue | `/approvals` |

---

## New Backend Endpoints

### `GET /pipeline/stats`
Real funnel metrics derived from observability traces — no hardcoded values.

**Live data as of last test run:**
```json
{
  "leads_researched": 3,
  "outreach_sent": 3,
  "replies_received": 3,
  "interested": 3,
  "meetings_booked": 2,
  "reply_rate": 1.0,
  "total_ai_calls": 76,
  "governance": { "approved": 46, "blocked": 1, "deferred": 13 },
  "agent_call_counts": {
    "intent": 22, "conversation": 10, "outreach": 32, "research": 12
  }
}
```

**How metrics are derived:**

| Metric | Source |
|--------|--------|
| `leads_researched` | Unique `lead_id` values in traces where `agent=research` |
| `outreach_sent` | `lead_id`s in validations with `agent=outreach` + `consequence=allow`; falls back to successful outreach traces if validations have null `lead_id` |
| `replies_received` | Intersection: leads that both received outreach AND have an `intent`/`conversation` trace |
| `interested` | Latest classified intent per lead = `interested` or `meeting_request` |
| `meetings_booked` | Latest classified intent per lead = `meeting_request` |
| `reply_rate` | `replies_received / outreach_sent` (intersection, not raw count) |

> **Bug fixed:** Previous implementation divided all-time reply counts by current-batch outreach count → produced >100% reply rate. Now uses set intersection `replied_leads ∩ outreach_ok`.

---

### `GET /memory/governance`
Live memory governance stats aggregated from `storage/memory_governance/events.jsonl`.

**Live data as of last test run:**
```json
{
  "write_policy":      { "memories_created": 39, "memories_rejected": 42, "low_value_blocked": 42 },
  "retrieval_policy":  { "retrieved": 146, "accepted": 131, "rejected_below_threshold": 15 },
  "decay_policy":      { "expired_facts": 2, "reaffirmed_facts": 3, "stale_facts_detected": 2 },
  "protection_policy": { "cross_tenant_reads": 0, "blocked_access_attempts": 0, "namespace_violations": 0 },
  "context_budget":    { "current_task": 50.5, "research": 20.4, "memory": 29.1, "trends": 0.0, "other": 0.0 },
  "total_memory_events": 135
}
```

**Context budget** is derived from real token distribution across agent trace types — not hardcoded.

---

## Memory Architecture

### Overview

Three-layer persistent memory + short-term in-memory cache, all gated through a four-policy governance orchestrator.

```
Inbound content
      │
      ▼
MemoryGovernance (singleton)
  ├── ProtectionPolicy  → namespace isolation (cross-tenant guard)
  ├── WritePolicy       → relevance scoring (blocks noise / low-value)
  ├── RetrievalPolicy   → threshold filtering on reads
  └── DecayPolicy       → half-life scoring on old facts
      │
      ▼
Memory Layers
  ├── EpisodicMemory   → per-lead conversation history (last 10 raw + archive)
  ├── SemanticMemory   → persistent domain facts with provenance
  ├── EntityMemory     → structured per-lead facts (company, title, signals)
  └── ShortTermMemory  → within-session working context (in-memory, evicts at 20)
```

**Storage paths** (all under `backend/storage/memory/`):

| Layer | Path |
|-------|------|
| Episodic | `episodic/<lead_id>.json` |
| Semantic | `semantic/<lead_id>.json` |
| Entity | `entity/<lead_id>.json` |
| Short-term | In-memory dict (not persisted) |
| Governance events | `../memory_governance/events.jsonl` |

---

### Policy 1 — Write Policy (`backend/memory/write_policy.py`)

Controls what gets stored. Evaluates free-form content before any write.

**Per-type thresholds:**

| Memory type | Min score to store |
|-------------|-------------------|
| `episodic` | 0.55 |
| `short_term` | 0.50 |
| `semantic` | 0.68 |
| `entity` | 0.68 |

**Scoring formula:**
```
base = 0.45
for kw in _BV_HIGH: if kw in content: base += 0.12   # "pipeline", "databricks", "compliance", "etl", …
for kw in _BV_MED:  if kw in content: base += 0.06   # "objection", "meeting", "legacy", "unreliable", …
for kw in _BV_LOW:  if kw in content: base += 0.03   # "question", "curious", …
score = base × multiplier[memory_type]   # semantic=1.0, entity=0.95, episodic=0.85, short_term=0.80
```

**Noise patterns** (always blocked regardless of score):
- Greetings: `hi`, `hello`, `hey`
- Acknowledgements: `ok`, `thanks`, `sounds good`, `noted`, `got it`, `will do`
- Single-word confirmations: `yes`, `no`, `sure`, `great`

**Entity memory exception:** Entity writes (`update_entity()`) bypass relevance scoring entirely — structured fields like `"Acme Corp"` or `"250"` are always stored if non-empty. Only protection policy applies.

---

### Policy 2 — Retrieval Policy (`backend/memory/retrieval_policy.py`)

Controls what gets injected into context on reads.

**Threshold:** `RELEVANCE_THRESHOLD = 0.40` — below this, memory is not injected

**Scoring:**
```python
combined = f"{key} {value}".replace("_", " ")   # key name contributes to matching
q_tokens = set(query.split())
c_tokens = set(combined.split())
overlap  = |q_tokens ∩ c_tokens| / |q_tokens ∪ c_tokens|
score    = min(0.30 + overlap × 1.4, 1.0)
```

**Key name inclusion** was added this session — without it, querying "technology" failed to match a fact stored under key `tech_stack` because "tech_stack" was not included in the token comparison.

**Production path:** Replace token overlap with cosine similarity (Voyage AI). The architecture supports swap-in — `filter_and_rank()` API is unchanged.

**Episodic reads** skip retrieval policy — conversation history is chronological, not semantic search.

---

### Policy 3 — Decay Policy (`backend/memory/decay_policy.py`)

Half-life decay: `effective_score = confidence × rate^(age_days / 30)`

**Decay rates per fact type:**

| Fact type | Rate per 30 days | Rationale |
|-----------|-----------------|-----------|
| `preference` | 0.90 | Preferences change slowly |
| `objection` | 0.75 | Objections can be overcome |
| `fact` (default) | 0.85 | General facts decay slowly |
| `meeting_request` | 0.50 | Stale if not acted on quickly |
| `trend` | 0.40 | Market signals expire ~30 days |
| `signal` | 0.30 | Hiring/funding news expires fast |

**Categories after scan:**
- `expired` — effective score < 0.30 (should be purged)
- `stale` — effective score 0.30–0.50 (flag for review)
- `healthy` — effective score > 0.50

---

### Policy 4 — Protection Policy (`backend/memory/protection_policy.py`)

Namespace isolation — prevents cross-tenant reads/writes.

**System scopes** (always allowed): `__system__`, `__admin__`, `__governance__`

**Rules:**
- `validate_write(lead_id, writer_scope)` — blocks writes to another lead's namespace
- `validate_read(lead_id, reader_scope)` — blocks reads across lead namespaces
- Every violation is recorded to the event store

---

### Memory Layers

#### EpisodicMemory
Conversation history across sessions.

```python
mm.episodic.append(lead_id, role, content)  # returns False if blocked by write policy
mm.episodic.get(lead_id)                    # returns raw messages (no threshold filter)
mm.episodic.recent(lead_id, n=6)            # plain-text for prompt injection
mm.episodic.archive_summary(lead_id)        # extractive summary of messages older than 10
```

Storage format (`episodic/<lead_id>.json`):
```json
{
  "raw": [ { "role": "user", "content": "...", "ts": "ISO", "confidence": 0.72 } ],
  "archive_summary": "USER: … \nSDR: …",
  "archive_count": 0
}
```

Sliding window: last 10 kept as raw; overflow is prepended to `archive_summary` (extractive, first 120 chars per message — no LLM call).

#### SemanticMemory
Persistent domain facts with provenance.

```python
mm.semantic.set(key, value, lead_id, fact_type, source)  # returns False if below threshold
mm.semantic.get(lead_id, query="")                        # query="" returns all; query applies threshold
mm.semantic.get_trends()                                  # system-level trend facts
```

Conflict resolution: **higher confidence wins**, not "latest wins". A new write is rejected if the existing fact has higher confidence.

#### EntityMemory
Structured per-lead facts (bypasses relevance scoring).

```python
mm.update_entity(lead_id, {"company": "Acme", "title": "CTO", "headcount": "250"})
mm.get_entity(lead_id)   # returns dict keyed by field name, each with provenance
```

Each field stored with `source`, `asserted_at`, `confidence=0.85`, `fact_type=entity`.

#### ShortTermMemory
Within-session working context. Not persisted to disk.

```python
mm.short_term.add(session_id, {"type": "signal", "content": "...", "relevance": 0.7})
mm.short_term.get(session_id)
mm.short_term.clear(session_id)
```

**Eviction formula:** `score = 0.6 × relevance + 0.4 × recency`  
**Cap:** 20 items. When exceeded, lowest-scoring items are dropped.  
**Protected types** (never evicted): `apollo_fact`, `research_summary`, `top_trend`

---

### MemoryManager Facade

`backend/agents/conversation/memory_manager.py` — backward-compatible interface used by `ConversationAgent`.

```python
mm = MemoryManager()
mm.store_message(lead_id, role, content)      # episodic append
mm.get_history(lead_id)                       # → [{role, content, timestamp}]
mm.summarize_history(lead_id)                 # → plain text, last 6 messages
mm.update_entity(lead_id, facts_dict)         # entity merge
mm.get_entity(lead_id)                        # → full entity dict
mm.update_trends(trends)                      # semantic system-level trends
mm.get_trends()                               # → list[dict]
mm.clear(lead_id)                             # deletes episodic + entity files
```

---

### Governance Orchestrator (`backend/memory/memory_governance.py`)

Module-level singleton — `from memory.memory_governance import governance`

```python
governance.governed_write(content, memory_type, lead_id, writer_scope="__system__")
# → {"written": bool, "relevance_score": float, "reason": str}

governance.governed_retrieve(query, memories, lead_id, reader_scope, memory_type)
# → list[dict]   (filtered + ranked)

governance.run_decay_scan(memories, lead_id)
# → {"expired": [...], "stale": [...], "healthy": [...]}

governance.get_stats()
# → MemoryGovernanceStats dict  (served at /memory/governance)
```

Every call records an event to `storage/memory_governance/events.jsonl` for observability.

---

### Event Store (`backend/memory/event_store.py`)

JSONL append-only log at `backend/storage/memory_governance/events.jsonl`.

**Event types:**

| Method | Recorded on |
|--------|-------------|
| `record_write(lead_id, written, reason, memory_type, content_preview)` | Every `governed_write` call |
| `record_retrieval(lead_id, retrieved, accepted, rejected)` | Every `governed_retrieve` call |
| `record_decay(lead_id, status, fact_type, score)` | Every fact in `run_decay_scan` |
| `record_protection(lead_id, action, allowed, reason)` | Every protection policy check |

`get_stats()` aggregates all events and computes the context budget from real token distribution in `storage/diagnostics/traces.jsonl`.

---

## UI Changes

### `CommandCenterPage.tsx` — full rewrite

**Structural:**
- Removed internal `<aside>` sidebar (was duplicating app-level sidebar)
- Replaced page wrapper with `<Topbar>` component matching all other pages
- Removed hardcoded `bg-[#0C0E13]` dark hex — all colors now use design tokens

**Design tokens used:**
```
bg-canvas, bg-surface, bg-surface-2
text-ink, text-ink-2, text-ink-mute
border-line-soft
```

SVG elements use CSS variables directly: `fill="rgb(var(--c-ink))"`, `stroke="rgb(var(--c-line-soft))"` (SVG does not inherit Tailwind classes).

**Live data queries added:**

| Query | Endpoint | Refetch |
|-------|----------|---------|
| `pipelineStats` | `GET /pipeline/stats` | 30s |
| `memoryGovernance` | `GET /memory/governance` | 60s |

**Dashboard metrics now dynamic:**

| Panel | Old (hardcoded) | New (derived from) |
|-------|----------------|-------------------|
| Prospects discovered | 1250 | `stats.leads_researched` |
| Messages sent | 487 | `stats.outreach_sent` |
| Reply rate | 28% | `stats.reply_rate × 100` |
| Meetings booked | 42 | `stats.meetings_booked` |
| Governance decisions | fixed counts | `stats.governance.approved / blocked / deferred` |
| Agent performance — Calls | — | `stats.agent_call_counts[agent]` |

**Live Execution Trace — lead selector:**
- Dropdown at top of trace panel listing all unique `lead_id`s from recent traces
- Cross-referenced with approval queue for display names
- "All Leads" mode: each row has `ExternalLink` icon → navigates to `/lineage?lead=<id>`
- Single-lead mode: banner + "Pipeline Lineage →" button deep-links to that lead's lineage

**Row 5 — Memory Governance (new):**  
Three panels added below the existing 4 dashboard rows:

1. **Write + Retrieval Policy** — memories created/rejected, acceptance rate bar
2. **Decay + Protection** — expired/stale facts, reaffirmed count, protection violations
3. **Context Budget** — horizontal bar chart: `current_task` / `research` / `memory` / `trends` percentages (from real token distribution)

---

### `PipelineLineagePage.tsx` — deep-link support

Added `useSearchParams` to read `?lead=<id>` from the URL and auto-select that lead on mount:

```tsx
const [searchParams] = useSearchParams();
const [selectedLeadId, setSelectedLeadId] = useState<string | null>(
  searchParams.get("lead")
);
useEffect(() => {
  const leadParam = searchParams.get("lead");
  if (leadParam) setSelectedLeadId(leadParam);
}, [searchParams]);
```

This means clicking "Pipeline Lineage →" from the Command Center trace panel lands directly on the correct lead's lineage DAG.

---

### `frontend/src/lib/api.ts` — new types + functions

```typescript
// GET /pipeline/stats
export type PipelineStats = {
  leads_researched: number;
  outreach_sent: number;
  replies_received: number;
  interested: number;
  meetings_booked: number;
  reply_rate: number;
  total_ai_calls: number;
  governance: { approved: number; blocked: number; deferred: number };
  agent_call_counts: Record<string, number>;
};
export const pipelineStats = () => get<PipelineStats>("/pipeline/stats");

// GET /memory/governance
export type MemoryGovernanceStats = {
  write_policy:      { memories_created: number; memories_rejected: number; low_value_blocked: number };
  retrieval_policy:  { retrieved: number; accepted: number; rejected_below_threshold: number };
  decay_policy:      { expired_facts: number; reaffirmed_facts: number; stale_facts_detected: number };
  protection_policy: { cross_tenant_reads: number; blocked_access_attempts: number; namespace_violations: number };
  context_budget:    { current_task: number; research: number; memory: number; trends: number; other: number };
  total_memory_events: number;
};
export const memoryGovernance = () => get<MemoryGovernanceStats>("/memory/governance");
```

Both added to the `api` default export.

---

## Embedding Service — Retry + Fallback

**File:** `backend/agents/relevance/embedding_service.py`

**Problem:** VoyageAI free tier enforces 3 RPM. Running 3+ leads in sequence would hit the rate limit on the 3rd embedding call, crashing with `RateLimitError`.

**Fix — exponential backoff retry:**
```python
_MAX_RETRIES = 4
_BASE_SLEEP  = 22  # seconds (3 RPM = 1 call per 20s)

for attempt in range(_MAX_RETRIES):
    try:
        return vo.embed(texts, model="voyage-3").embeddings
    except Exception as exc:
        if "rate" in str(exc).lower() or "429" in str(exc):
            time.sleep(_BASE_SLEEP * (2 ** attempt))   # 22s, 44s, 88s, 176s
        else:
            break  # non-rate-limit error → fall through to keyword fallback
```

**Fix — keyword (BoW) fallback:**
When VoyageAI is unavailable (no API key, quota exhausted after all retries, import error):

```python
def _fallback_embed(self, texts):
    # Build shared vocabulary across all input texts
    all_tokens = [tok for t in texts for tok in t.lower().split()]
    vocab = {tok: i for i, tok in enumerate(dict.fromkeys(all_tokens))}
    # L2-normalised bag-of-words vector per text
    return [self._bow_vector(t, vocab, len(vocab)) for t in texts]
```

Cosine similarity handles dimension mismatch between VoyageAI vectors and BoW vectors by padding the shorter vector with zeros.

**Behaviour:**
1. Try VoyageAI → rate limit → sleep + retry (up to 4×)
2. If all retries exhausted → BoW fallback (trend ranking still works, lower quality)
3. If VoyageAI not configured (no `VOYAGE_API_KEY`) → BoW fallback immediately

---

## E2E Test Suite

**File:** `backend/e2e_test.py`  
**Run:** `cd backend && python3 e2e_test.py`  
**Duration:** ~8–12 minutes (LLM + VoyageAI calls are real)

### What it tests

**Phase 1 — Outreach Pipeline** (3 leads from `sample_data/demo_leads.json`)
- Research agent → context builder → VoyageAI trend ranking → governance orchestrator
- Governance **retries exercised** — all 3 leads required 2–3 attempts
- **Real emails sent** via Gmail SMTP to lead email addresses on file
- Validates: research summary present, 3 trends ranked, email subject+body generated, governance decision recorded

**Phase 2 — Inbound Reply Simulation** (9 conversation turns, 3 intents per lead)
- Intent set: `fact_question`, `interested`, `meeting_request`, `objection`, `unsubscribe`
- Validates: intent detected with correct label, response generated, Calendly link on meeting request, unsubscribe respected

**Phase 3 — Memory Architecture**
- Episodic: conversation turns stored per lead (with noise filtering verified)
- Semantic: industry-context facts written (above 0.68 threshold)
- Entity: 4 structured fields per lead stored unconditionally
- `+11` new memories accumulated across 3 leads
- Short-term eviction: fills 23 items → cap enforced at 20; all 3 protected types retained

**Phase 4 — Dashboard Data**
- Counts traces and validations written since start of test run
- Verifies all 4 agent types present in traces: `research`, `outreach`, `intent`, `conversation`
- Verifies pipeline stats funnel (researched/sent/replied all ≥ 3)
- Verifies memory events grew
- Verifies governance decisions include at least one `allow`

**Phase 5 — Governance Retry**
- Reports which leads triggered retry chains
- Reports how many emails were deferred to human review queue
- Samples first 2 defer records with their issues

### Sample output (last run)

```
Passed  : 65/65 (100%)
Warnings: 2       (retries triggered — expected)

Traces written this run  : +24
Validations written      : +24
Memory events total      : 135
Leads through full cycle : 3
Conversation turns       : 9

ALL CHECKS PASSED ✓
```

### Notes on sample data usage

- **Leads:** `sample_data/demo_leads.json` (25 leads) — Apollo People service always uses sample mode
- **Companies:** loaded directly from `sample_data/demo_companies.json` by name match — Apollo Company service is not called (it hits live API requiring paid plan)
- **Signals:** derived from sample company data (tech stack + headcount growth) — no live Apollo API call
- **LLM calls:** real Anthropic Claude calls (uses `ANTHROPIC_API_KEY` from `.env`)
- **Emails:** real Gmail SMTP sends (uses `LEADGENIE_GMAIL` + `LEADGENIE_GMAIL_PASSWORD` from `.env`)

---

## File Change Summary

| File | Change type | What changed |
|------|-------------|-------------|
| `backend/memory/write_policy.py` | **New** | Write policy with per-type thresholds, noise regex, BV keyword scoring |
| `backend/memory/retrieval_policy.py` | **New** | Retrieval threshold + token-overlap scoring (key+value) |
| `backend/memory/decay_policy.py` | **New** | Half-life decay rates per fact type |
| `backend/memory/protection_policy.py` | **New** | Namespace isolation (cross-tenant guard) |
| `backend/memory/event_store.py` | **New** | JSONL event log + `get_stats()` aggregator |
| `backend/memory/memory_governance.py` | **New** | Orchestrator singleton — `governed_write`, `governed_retrieve`, `run_decay_scan` |
| `backend/memory/__init__.py` | **New** | Package exports |
| `backend/agents/conversation/memory_manager.py` | **Rewritten** | 4-layer architecture (Episodic/Semantic/Entity/ShortTerm) + MemoryManager facade |
| `backend/agents/relevance/embedding_service.py` | **Modified** | Rate-limit retry (4×, exp backoff) + BoW fallback; Python 3.9 compatible |
| `backend/main.py` | **Modified** | `GET /pipeline/stats` endpoint; `GET /memory/governance` endpoint; reply rate intersection fix |
| `backend/e2e_test.py` | **New** | 5-phase, 65-check end-to-end test suite |
| `frontend/src/pages/CommandCenterPage.tsx` | **Rewritten** | Sidebar removed; design tokens; live data queries; lead-selector trace; Memory Governance row |
| `frontend/src/pages/PipelineLineagePage.tsx` | **Modified** | `useSearchParams` deep-link support for `?lead=` param |
| `frontend/src/lib/api.ts` | **Modified** | `PipelineStats` type + `pipelineStats()`; `MemoryGovernanceStats` type + `memoryGovernance()` |

---

## Known Gaps

| Gap | Status |
|-----|--------|
| `context_budget.trends` always 0% | Trend agent traces are not broken out separately in `diagnostic_store` — all go into `outreach` bucket |
| VoyageAI BoW fallback produces lower quality trend ranking | Acceptable for MVP; upgrade: add `VOYAGE_API_KEY` paid tier |
| Memory `memories_created` count is low (~39) | Write policy is intentionally strict (0.68 threshold); grows with real production traffic |
| Apollo Company service hits live API (401 in tests) | E2E test loads company from sample JSON directly; production would need paid Apollo plan |
| Short-term memory not persisted | By design — session context is transient; would need Redis for multi-process persistence |
