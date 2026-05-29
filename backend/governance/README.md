# Governance

Every generated email passes through three validation layers before being sent or approved. All decisions are written to an immutable audit trail.

---

## Risk scoring pipeline

```
Generated email
      │
      ▼
ToneValidator ──────── Checks for banned phrases, length violations
      │
      ▼
HallucinationChecker ── Claude verifies every claim against source facts
      │
      ▼
RiskEngine ────────────  Composite risk score 0.0–1.0
      │
      ├── score < 0.4 → approved: True  → email is sent
      └── score ≥ 0.4 → approved: False → held in /approval-queue
```

---

## risk_engine.py

Produces a `{ approved, risk_score, issues }` dict. Combines:
- Tone validation result (pass/fail + which rules triggered)
- Hallucination check result (verified claims, unverified claims)
- Heuristic scoring based on detected issues

The `issues` list is surfaced in the Approval Queue UI so reviewers know exactly why an email was flagged.

---

## tone_validator.py

Rule-based checker. Enforces:
- No banned phrases (e.g. "guaranteed ROI", "100% success", "act now")
- Maximum email length
- No excessive links

Returns `{ passed: bool, violations: list[str] }`.

---

## hallucination_checker.py

Uses Claude to verify each factual claim in the generated email against a `source_facts` dict (company name, industry, lead title, etc.). Returns `{ verified: list, unverified: list, passed: bool }`.

---

## audit_logger.py

Writes every governance decision, outreach generation event, and conversation reply to `backend/storage/audit_logs/{lead_id}.jsonl`.

Each entry is a JSON line with `timestamp`, `event_type`, `lead_id`, and event-specific payload.

Read via `GET /audit/{lead_id}` — returns the full list of entries for a lead in chronological order.
