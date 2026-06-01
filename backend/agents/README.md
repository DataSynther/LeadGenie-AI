# Agents

Each agent is a single-responsibility class that wraps a Claude call or embedding operation. They are stateless — no shared mutable state between calls.

---

## research/

**`research_agent.py`** — Takes a company dict and signals dict, calls Claude to produce:
- `summary` — 2-3 sentence company description
- `pain_points` — list of likely business pain points
- `strategic_priorities` — what the company is focused on
- `ai_readiness_score` — 1–10 score for AI adoption readiness
- `growth_stage` — early / growth / scale / enterprise

**`context_builder.py`** — Merges lead, company, signals, and research into a single `context` dict that all downstream agents consume. This is the canonical input shape passed through the entire pipeline.

---

## trends/

**`trend_agent.py`** — Fetches and caches current market trends from RSS feeds and a curated list. Returns a list of trend objects: `{title, summary, source, relevance_tags}`.

Cached to `backend/agents/trends/trend_store.json` to avoid re-fetching on every request.

---

## relevance/

**`relevance_engine.py`** — Ranks a list of trends against a lead context using semantic similarity. Returns the top-k most relevant trends for that specific lead.

**`embedding_service.py`** — Wraps Voyage AI to produce text embeddings. Used by the relevance engine to compute cosine similarity between the lead context and each trend.

> Note: Voyage AI free tier is limited to 3 requests/minute. The pipeline makes 2 calls per lead (context embedding + trend embeddings). Allow ~45s between leads when running in batch.

---

## outreach/

**`outreach_agent.py`** — Generates a personalized cold email using Claude. Takes the full context + top trends and returns `{subject, body, reasoning}`. Also handles objection responses via `respond_to_objection()`.

**`prompt_templates.py`** — Prompt string constants used by the outreach agent. Separated to make prompt iteration easier without touching business logic.

---

## conversation/

**`conversation_agent.py`** — Orchestrates the full reply handling flow:
1. Stores the inbound reply in memory
2. Classifies intent via `IntentDetector`
3. Routes to the correct response strategy
4. Stores the outbound response in memory
5. Sends email back via `EmailSender` if `lead_email` is provided

**Routing by intent:**
| Intent | Strategy |
|---|---|
| `unsubscribe` | Canned opt-out message, no email sent |
| `meeting_request` | Calendly URL inserted directly |
| `objection` | Routed to `OutreachAgent.respond_to_objection()` |
| `interested` | Claude with context — acknowledges situation, suggests 15-min call |
| `fact_question` | Claude with context — answers from research data honestly |
| `neutral` | Claude with context — adds one relevant insight, no meeting push |

**`intent_detector.py`** — Classifies a reply into one of 6 intent categories using Claude. Logs every classification event to `backend/storage/intent_analytics/events.jsonl` for analytics.

```python
result = IntentDetector().classify(reply, lead_id=lead_id, context=context)
# Returns: { intent, confidence, key_signal, reasoning }
```

**`memory_manager.py`** — Stores and retrieves per-lead conversation history. Persists to `backend/storage/conversations/{lead_id}.json`. `summarize_history()` returns a condensed string for injection into the Claude system prompt.

---

## Observability instrumentation

Every agent that calls Claude is instrumented with `AgentTracer` + `Validator` from `backend/observability/`. The pattern is the same across all 4 agents:

```python
from observability.agent_tracer import AgentTracer
from observability.validator import Validator

tracer = AgentTracer(agent="<name>", lead_id=lead_id, context=context, prompt_version="<name>_v1")
with tracer.trace(prompt=prompt, system=system) as t:
    response = client.messages.create(...)
    result = parse(response)
    t.finish(response, confidence=result.get("confidence"))
    Validator("<name>", lead_id=lead_id, context=context).validate(result, tracker=t)
    # ^ Validator MUST be inside the `with` block to prevent validation_gap being fired
```

The tracer writes to `backend/storage/diagnostics/traces.jsonl`. The validator writes to `backend/storage/diagnostics/validations.jsonl`. Both are queried by the `/dev/*` endpoints and the DevDashboardPage at `/dev`.

**Instrumented agents:**

| Agent | `agent=` key | Prompt version tracked | Confidence tracked |
|---|---|---|---|
| `research_agent.py` | `"research"` | `"research_v1"` | No |
| `outreach_agent.py` (email) | `"outreach"` | `"outreach_email_v1"` | No |
| `outreach_agent.py` (follow-up) | `"outreach"` | `"followup_v1"` | No |
| `outreach_agent.py` (objection) | `"outreach"` | `"objection_v1"` | No |
| `intent_detector.py` | `"intent"` | `"intent_v1"` | Yes — from JSON `confidence` field |
| `conversation_agent.py` | `"conversation"` | `"conv_{intent}_v1"` | No |

See `backend/observability/README.md` for full details on adding new agents.
