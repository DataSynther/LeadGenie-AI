# Demo Flow — Governed Adaptive AI SDR

## End-to-End Pipeline Walkthrough

### Step 1 — Lead Discovery
- Input: target domain + persona filters (title, seniority)
- Apollo `/mixed_people/api_search` returns qualified leads
- Output: normalized lead list with name, title, LinkedIn, org ID

### Step 2 — Company Intelligence
- Apollo `/organizations/enrich` enriches the lead's company
- Fields captured: industry, employee count, funding stage, tech stack, description

### Step 3 — Signal Intelligence
- Apollo `/organizations/{org_id}/job_postings` fetches hiring data
- Signals extracted: AI hiring count, engineering expansion, scaling flag

### Step 4 — Research & Context Engine
- Claude summarizes company context into: summary, growth stage, pain points, AI readiness score
- `ContextBuilder` assembles unified lead context payload

### Step 5 — Trend Intelligence
- `TrendAgent` loads curated + RSS market trends
- Trends tagged with relevance categories and keywords

### Step 6 — Semantic Relevance Engine
- `RelevanceEngine` embeds lead context + trend texts via Voyage AI
- Cosine similarity ranks top 3 most relevant trends for this specific lead

### Step 7 — Adaptive Outreach Generation
- `OutreachAgent` calls Claude with lead context + top trend
- Output: JSON with subject, body, reasoning

### Step 8 — Governance Validation
- `ToneValidator` checks banned phrases, length, tone
- `HallucinationChecker` verifies claims against source facts
- `RiskEngine` computes risk score and approves or flags for human review
- All decisions logged to `AuditLogger`

### Step 9 — Conversation Handling
- Inbound replies routed to `ConversationAgent`
- `MemoryManager` maintains per-lead conversation history
- Objections handled with empathy + reframing

### Step 10 — Meeting Scheduling
- Approved emails include Calendly scheduling link
- `Scheduler` generates one-time booking URLs
- Meeting confirmations recorded in audit trail

### Step 11 — Continuous Learning
- `FeedbackCollector` records outcomes (meeting booked, objection, unsubscribed)
- `LearningEngine` analyzes patterns and generates improved guidance
- Performance degradation triggers human escalation

---

## Governance Decision States

| State      | Meaning                                         |
|------------|-------------------------------------------------|
| `approved` | All checks passed, auto-send eligible           |
| `flagged`  | Risk score > 0.4 or tone/hallucination failure  |
| `pending`  | Awaiting human review                           |
| `rejected` | Human reviewer rejected the outreach            |
