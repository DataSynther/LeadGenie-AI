# Observability — Governed AI Diagnostic Layer

> Phase 1 of the Governed Agentic AI Platform. Instruments every Claude call across all agents, validates every output, and feeds a live developer dashboard.

---

## What this layer does

Every time any agent calls Claude, three things happen automatically:

1. **Tracer** measures the call — latency, tokens, context quality, prompt clarity
2. **Validator** checks the output — shape, context grounding, policy compliance
3. **Store** persists both records — queryable by the `/dev/*` endpoints and the frontend dashboard

No agent needs to think about observability. It's wired in at the call site.

---

## Files

```
backend/observability/
├── __init__.py             # Exports diagnostic_store for import in main.py
├── diagnostic_store.py     # JSONL persistence + query helpers + 5 category constants
├── agent_tracer.py         # Context manager wrapping every Claude call
└── validator.py            # Shape + context + policy + business rule checks
```

---

## Module 1: `diagnostic_store.py`

Central JSONL store. Two files on disk:

```
backend/storage/diagnostics/
├── traces.jsonl       # One record per Claude call
└── validations.jsonl  # One record per validation check
```

### Diagnostic Category Constants

Five failure categories map directly to the root causes of AI hallucination:

| Constant | Value | What it means |
|---|---|---|
| `CATEGORY_RETRIEVAL` | `"retrieval_failure"` | Retrieved context was semantically close but factually wrong |
| `CATEGORY_CONTEXT` | `"insufficient_context"` | Required fields missing or null in context dict |
| `CATEGORY_PROMPT` | `"ambiguous_prompt"` | Prompt contained vague instructions (model chose an unvalidated interpretation) |
| `CATEGORY_VALIDATION` | `"validation_gap"` | Agent output flowed downstream with no validation check applied |
| `CATEGORY_TASK_MISMATCH` | `"task_model_mismatch"` | Model confidence < 0.65 or output structure mismatched task |

### Write functions

```python
from observability.diagnostic_store import write_trace, write_validation

# Write a trace after a Claude call
write_trace(
    agent="outreach",
    lead_id="lead-001",
    prompt_preview=prompt[:300],
    response_preview=response.content[0].text[:300],
    latency_ms=1240.5,
    tokens_used=512,
    success=True,
    diagnostic_categories=["insufficient_context"],
    metadata={
        "context_score": 0.4,
        "ambiguity_score": 0.1,
        "retrieval_score": None,
        "confidence": None,
        "prompt_version": "outreach_email_v1",
    }
)

# Write a validation outcome
write_validation(
    agent="outreach",
    lead_id="lead-001",
    shape_ok=True,
    context_ok=False,
    policy_ok=True,
    consequence="defer",
    issues=["context:company_name_absent:Acme"],
    output_preview=output_body[:300],
)
```

### Query functions

```python
from observability.diagnostic_store import (
    get_recent_traces,       # last N trace records
    get_recent_validations,  # last N validation records
    get_agent_metrics,       # per-agent aggregated stats
    get_diagnostics_summary, # counts + recent events per category
)

# Called by GET /dev/traces
traces = get_recent_traces(limit=50)

# Called by GET /dev/agent-metrics
metrics = get_agent_metrics()
# Returns:
# {
#   "intent": {
#     "total_calls": 12, "success_rate": 0.917, "avg_latency_ms": 2340.1,
#     "avg_tokens": 291, "avg_confidence": 0.93,
#     "validation": { "total": 12, "allow": 11, "block": 0, "defer": 1, "pass_rate": 0.917 }
#   },
#   ...
# }

# Called by GET /dev/diagnostics
summary = get_diagnostics_summary()
# Returns:
# {
#   "total_traces": 47,
#   "by_category": {
#     "retrieval_failure": { "count": 2, "label": "Retrieval Failure", "description": "...", "recent_events": [...] },
#     "insufficient_context": { ... },
#     ...
#   }
# }
```

---

## Module 2: `agent_tracer.py`

Context manager that wraps every `client.messages.create()` call. Measures and scores the call automatically.

### How to use it in an agent

```python
from observability.agent_tracer import AgentTracer
from observability.validator import Validator

tracer = AgentTracer(
    agent="outreach",
    lead_id=lead_id,
    context=context,          # full context dict — used for completeness scoring
    retrieval_score=0.82,     # optional: from relevance engine
    prompt_version="email_v1" # optional: tracks which prompt template was used
)

with tracer.trace(prompt=prompt_text, system=system_text) as t:
    response = client.messages.create(...)
    result = parse_response(response)
    t.finish(response, confidence=result.get("confidence"))
    Validator("outreach", lead_id=lead_id, context=context).validate(result, tracker=t)
    # ^ validator must be called INSIDE the with block to clear the validation-gap flag
```

### What the tracer measures automatically

| Signal | How it's computed |
|---|---|
| **Latency** | `time.perf_counter()` before/after the `with` block |
| **Token count** | `response.usage.input_tokens + response.usage.output_tokens` |
| **Context completeness score (0–1)** | Fraction of `lead/company/research/signals` sub-fields that are non-null |
| **Prompt ambiguity score (0–1)** | Density of vague phrases per 100 words (regex match) |
| **Retrieval quality** | Passed in as `retrieval_score` from the relevance engine |
| **Task-model mismatch** | `confidence < 0.65` from structured JSON response |
| **Validation gap** | `tracker.validation_skipped` stays True unless validator runs inside the block |

### Category thresholds

| Category | Fires when |
|---|---|
| `retrieval_failure` | `retrieval_score` provided and `< 0.55` |
| `insufficient_context` | `context_score < 0.50` |
| `ambiguous_prompt` | `ambiguity_score > 0.30` |
| `task_model_mismatch` | `confidence` provided and `< 0.65` |
| `validation_gap` | Validator not called inside the `with` block |

### Standalone scoring utilities

```python
from observability.agent_tracer import score_context_completeness, score_prompt_ambiguity

score = score_context_completeness({
    "lead": {"name": "Ravi", "title": "VP", "email": "ravi@co.com"},
    "company": {"name": "Acme", "industry": "SaaS", "employee_count": 200},
    "research": {"summary": "...", "pain_points": ["latency"], "growth_stage": "growth"},
    "signals": {"scaling": True},
})
# → 1.0 (all 9 expected sub-fields are populated)

score = score_context_completeness({"lead": {"name": "John"}})
# → 0.1 (only 1 of 9 fields present)

ambig = score_prompt_ambiguity("If appropriate, maybe include a CTA, something like a follow-up.")
# → 0.8+ (high ambiguity)
```

---

## Module 3: `validator.py`

Runs after every agent output. Decides: **allow** (safe to proceed) / **block** (malformed, stop) / **defer** (needs human review).

### Validation model

```
Output produced by agent
        │
        ▼
  Shape Check ─────────────────── Does output have required fields for this agent type?
        │                         Missing fields → block
        ▼
  Context Check ───────────────── Does the output make sense given the context?
        │                         Response too short / company name missing → defer
        ▼
  Policy Check ────────────────── Any business rule violations?
        │                         High-review intent / high risk score → defer
        ▼
  Consequence:  allow | block | defer
        │
        ▼
  write_validation() → validations.jsonl
```

### Required shapes per agent

| Agent key | Required fields |
|---|---|
| `"outreach"` | `subject`, `body` |
| `"outreach_objection"` | `response_text` |
| `"research"` | `summary`, `growth_stage`, `strategic_priorities`, `likely_pain_points`, `ai_readiness_score` |
| `"intent"` | `intent`, `confidence` |
| `"conversation"` | non-empty string (no specific fields) |
| `"governance"` | `approved`, `risk_score` |

### How to use it

```python
from observability.validator import Validator

v = Validator(
    agent="research",
    lead_id="lead-001",
    context=context,
)

result = v.validate(agent_output, tracker=t)
# result["consequence"] is "allow" | "block" | "defer"
# result["issues"] is a list of human-readable issue strings
```

### Issue string format

Issues use a `check:detail` format:

| Issue | Meaning |
|---|---|
| `shape:not_a_dict` | Output is not a dict when one was required |
| `shape:missing_fields:subject,body` | Listed fields missing or empty |
| `shape:empty_output` | Free-form output is empty string |
| `context:response_too_short` | Body < 20 characters for outreach/conversation agents |
| `context:company_name_absent:Acme` | Company name from context not mentioned in output |
| `policy:high_review_intent:unsubscribe` | Intent flagged for human review |
| `policy:high_risk_score:0.75` | Governance risk score above threshold |
| `policy:empty_email` | Subject and body both empty |

---

## API endpoints (served from `main.py`)

| Endpoint | Returns |
|---|---|
| `GET /dev/diagnostics` | `get_diagnostics_summary()` — 5-category breakdown with counts and recent events |
| `GET /dev/agent-metrics` | `get_agent_metrics()` — per-agent success rate, latency, tokens, confidence, validation pass rate |
| `GET /dev/traces?limit=50` | `get_recent_traces(limit)` — raw trace log |
| `GET /dev/validation-log?limit=50` | `get_recent_validations(limit)` — raw validation event log |

All endpoints auto-populate as agents run — no setup needed beyond starting the backend.

---

## Frontend: `DevDashboardPage.tsx`

Accessible at `/dev` in the frontend. Auto-refreshes all panels every 10 seconds via React Query `refetchInterval`.

| Panel | Data source | What it shows |
|---|---|---|
| Hallucination Root Cause | `GET /dev/diagnostics` | 5 category cards with counts + last 3 events each |
| AI Operations | `GET /dev/agent-metrics` | Per-agent table: success rate, latency, confidence, validation pass rate |
| Governance & Validation | `GET /dev/validation-log` | Allow/Block/Defer summary + stacked bar + live event feed |
| Retrieval & Prompt Intelligence | `GET /dev/traces` | Context coverage vs ambiguity bars per agent, prompt version breakdown |
| System Insights | `GET /dev/agent-metrics` | Latency bottleneck chart, token usage, estimated USD cost |
| Live Trace Feed | `GET /dev/traces` | Last 20 calls with diagnostic category chips, colour-coded |

---

## Adding a new diagnostic category

1. Add a constant in `diagnostic_store.py`:
   ```python
   CATEGORY_MEMORY_STALE = "memory_stale"
   ```

2. Add detection logic in `agent_tracer.py` → `detect_categories()`:
   ```python
   if memory_age_days and memory_age_days > 30:
       cats.append(CATEGORY_MEMORY_STALE)
   ```

3. Add label + description in `diagnostic_store.py` → `_category_label()` and `_category_description()`

4. Add the key to the `categories` list in `get_diagnostics_summary()`

5. Add a colour entry in `DevDashboardPage.tsx` → `CATEGORY_COLOURS` dict

---

## Adding a new agent with instrumentation

```python
# In your new agent file:
from observability.agent_tracer import AgentTracer
from observability.validator import Validator

class MyNewAgent:
    def run(self, context: dict, lead_id: str = None) -> dict:
        prompt = build_my_prompt(context)
        system = "You are ..."

        tracer = AgentTracer(
            agent="my_agent",      # new name — shows up in all dashboard panels
            lead_id=lead_id,
            context=context,
            prompt_version="my_agent_v1",
        )

        with tracer.trace(prompt=prompt, system=system) as t:
            response = client.messages.create(
                model=MODEL, max_tokens=512, system=system,
                messages=[{"role": "user", "content": prompt}],
            )
            result = json.loads(response.content[0].text)
            t.finish(response, confidence=result.get("confidence"))
            Validator("my_agent", lead_id=lead_id, context=context).validate(result, tracker=t)

        return result
```

Then add `"my_agent"` to `SHAPES` in `validator.py` with the expected output fields.

---

## Storage

```
backend/storage/diagnostics/
├── traces.jsonl        # Append-only, one JSON line per Claude call
└── validations.jsonl   # Append-only, one JSON line per validation event
```

These files are gitignored. In production (Phase 2 / AWS), replace `_append()` and `_read_all()` in `diagnostic_store.py` with database writes (Postgres, DynamoDB, or CloudWatch Logs).
