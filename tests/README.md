# Tests

Run from the repo root:

```bash
cd backend
python3 -m pytest ../tests/ -v
```

Or run a single file:
```bash
python3 tests/test_conversation_agent.py
python3 tests/test_research_agent.py
```

---

## test_conversation_agent.py

10 tests covering the full conversation + intent detection pipeline.

| Group | Tests |
|---|---|
| Intent Detection | `interested`, `objection`, `fact_question`, `neutral`, `meeting_request`, `unsubscribe` |
| Context-Grounded Responses | fact question answers from research data, neutral adds insight without pushing meeting |
| Multi-Turn Memory | follow-up reply references earlier exchange |
| Email Send-Back | `email_sent: True` when `lead_email` is provided and intent is not unsubscribe |

The test runner accepts `expected_intent` as a string or list — useful for replies that could reasonably be classified as more than one intent.

## test_research_agent.py

Tests the research agent and context builder against a sample company. Verifies that output contains required keys (`summary`, `pain_points`, `ai_readiness_score`, etc.) and that the context builder produces a valid unified context dict.
