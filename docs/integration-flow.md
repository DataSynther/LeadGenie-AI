# Integration Flow — Frontend ↔ Backend

This document is the single reference for understanding:
- How every frontend page gets its data
- Which backend endpoint serves it
- Which agent or service produces that data
- What is currently static (mock) vs live
- Where to add new data when building new features

---

## How frontend talks to backend

All API calls are centralised in one file: **`frontend/src/lib/api.ts`**

- No page or component calls `fetch()` directly
- Every function in `api.ts` maps 1:1 to a backend route in `backend/main.py`
- Pages use `useQuery` (read) or `useMutation` (write) from React Query
- The base URL is set via `VITE_API_URL` env var (defaults to `http://localhost:8000`)

```
Frontend Page
    │
    ├── useQuery({ queryFn: api.someFunction })
    │         │
    │         ▼
    │   frontend/src/lib/api.ts   ← add new functions here
    │         │
    │         ▼ HTTP request
    │   backend/main.py           ← add new routes here
    │         │
    │         ▼
    │   Agent / Service           ← business logic lives here
    │         │
    │         ▼
    │   External API / Storage
```

---

## Page-by-page data sources

---

### DashboardPage

**Route:** `/`
**File:** `frontend/src/pages/DashboardPage.tsx`

| UI Element | Data Source | API Call | Backend Handler | Status |
|---|---|---|---|---|
| KPI cards (prospects, messages, reply rate, meetings) | `stats.prospects_discovered`, `stats.messages_sent`, `stats.reply_rate`, `stats.meetings_booked` | `api.dashboardStats()` | `GET /dashboard/stats` → hardcoded in `main.py:L166` | **Static mock** |
| Funnel chart | `stats.funnel[]` → `{label, count, pct}` | `api.dashboardStats()` | Same as above | **Static mock** |
| Risk distribution bar | `stats.risk_distribution` → `{low, medium, high}` | `api.dashboardStats()` | Same as above | **Static mock** |
| Blocked patterns list | `stats.blocked_patterns[]` → `{label, count}` | `api.dashboardStats()` | Same as above | **Static mock** |
| Agent activity feed | `events[]` → `{timestamp, agent, message}` | `api.recentAgentEvents()` | `GET /agent-feed/recent` → hardcoded in `main.py:L189` | **Static mock** |
| Pending approvals preview | `items[]` from approval queue | `api.approvalQueue()` | `GET /approval-queue` → Apollo leads + risk logic in `main.py:L257` | **Live (Apollo)** |

**To make KPI cards and funnel live:**
- Replace the hardcoded return in `main.py:L166` with real aggregated counts from `backend/storage/` (audit logs, feedback, conversations)
- Shape must match: `{ prospects_discovered: {value, delta_pct}, messages_sent: {value, delta_pct}, reply_rate: {value, delta_pct}, meetings_booked: {value, delta_abs}, funnel: [{label, count, pct}], risk_distribution: {low, medium, high}, blocked_patterns: [{label, count}] }`

**To make agent feed live:**
- Replace hardcoded return in `main.py:L189` with real events read from `backend/storage/audit_logs/` or a dedicated event log
- Each event: `{ timestamp: ISO string, agent: "research"|"outreach"|"reply"|"gov"|"schedule", message: string }`

---

### PipelinePage

**Route:** `/pipeline`
**File:** `frontend/src/pages/PipelinePage.tsx`

| UI Element | Data Source | API Call | Backend Handler | Status |
|---|---|---|---|---|
| Lead rows (name, company, title) | Apollo search results | `api.pipeline()` | `GET /pipeline` → `ApolloPeopleService.search_people()` in `main.py:L229` | **Live (Apollo)** |
| Stage chip | `lead.stage` | Same | Hardcoded as `"new"` for all leads | **Partial — stage not tracked** |
| Signal pills | `lead.signals[]` | Same | Returns empty `[]` for all leads | **Empty — not wired** |
| Reply chance % | `lead.reply_probability` | Same | Hardcoded `0.45` for all leads | **Static mock** |

**To make stage and reply_probability live:**
- `stage` should be read from a lead state store (e.g. `backend/storage/lead_state/{lead_id}.json`) updated when outreach is sent, reply is received, meeting is booked
- `reply_probability` should come from the learning engine's analysis of similar lead profiles
- `signals` should be populated by `_compute_signals()` in `main.py:L287` — this already works for company-based signals, needs to be wired into `_person_to_pipeline_item()` at `main.py:L211`

---

### LeadDiscoveryPage

**Route:** `/discover`
**File:** `frontend/src/pages/LeadDiscoveryPage.tsx`

| UI Element | Data Source | API Call | Backend Handler | Status |
|---|---|---|---|---|
| Search results table | Live Apollo search | `api.leadSearch({company_names, titles, seniorities, per_page})` | `POST /leads/search` → `ApolloPeopleService.search_people()` in `main.py:L90` | **Live (Apollo)** |
| ResearchPanel (side drawer) | Company data + signals | `api.companyResearch(lead.company)` | `GET /company/research/:name` → looks up `sample_data/demo_companies.json` in `main.py:L312` | **Demo data only** |
| "Generate Outreach" button | — | Not wired | Should call `api.generateOutreach(lead.id, domain)` | **UI only — not wired** |
| "Add to Pipeline" button | — | Not wired | No backend endpoint yet | **UI only — not wired** |

**ResearchPanel data shape** (what `GET /company/research/:name` must return):
```json
{
  "name": "Traya",
  "industry": "health, wellness & fitness",
  "employee_count": 320,
  "revenue": "12M",
  "founded_year": 2019,
  "funding_stage": "Series B",
  "description": "...",
  "linkedin_url": "https://linkedin.com/company/traya",
  "technologies": ["Salesforce", "HubSpot", "AWS"],
  "headcount_growth_6m": 0.12,
  "headcount_growth_12m": 0.28,
  "signals": [
    { "type": "hiring", "label": "Rapid growth +28% 12m", "strength": "hot" },
    { "type": "ai", "label": "AI stack detected", "strength": "hot" }
  ]
}
```

**To wire "Generate Outreach":**
- Call `api.generateOutreach(lead.id, companyDomain)` on button click
- Requires `lead.id` (Apollo ID) and company domain (derive from `lead.company` name or add a domain field to the Lead type)
- Response includes the full email draft + governance result — show in a modal or drawer

**To extend company research beyond demo data:**
- Add more companies to `sample_data/demo_companies.json`, OR
- Replace the file lookup in `main.py:L312` with a live Apollo company enrichment call using the company name

---

### ApprovalQueuePage

**Route:** `/approval`
**File:** `frontend/src/pages/ApprovalQueuePage.tsx`

| UI Element | Data Source | API Call | Backend Handler | Status |
|---|---|---|---|---|
| Queue items (lead name, risk, snippet, trigger) | Apollo leads + governance logic | `api.approvalQueue()` | `GET /approval-queue` → `main.py:L257` | **Live (Apollo + mock risk)** |
| "Approve & Send" button | — | Not wired to backend | Removes item from local state only | **Local state only** |
| "Reject" button | — | Not wired to backend | Removes item from local state only | **Local state only** |
| Stats (Approved today, Avg response, Auto-blocked) | Hardcoded in component | None | None | **Static mock** |

**To wire Approve & Reject:**
- Add `POST /approval-queue/{event_id}/approve` and `POST /approval-queue/{event_id}/reject` endpoints in `main.py`
- On approve: call `AuditLogger().update_decision(lead_id, event_id, "approved")` + trigger `EmailSender().send()`
- On reject: call `AuditLogger().update_decision(lead_id, event_id, "rejected")`
- Frontend: replace `removeItem()` with a `useMutation` that hits the new endpoint, then removes from local state on success

---

### ConversationsPage

**Route:** `/conversations`
**File:** `frontend/src/pages/ConversationsPage.tsx`

| UI Element | Data Source | API Call | Backend Handler | Status |
|---|---|---|---|---|
| Conversation list (left sidebar) | `src/data/conversations.ts` | None | None | **Fully static — hardcoded** |
| Message thread (right panel) | `src/data/conversations.ts` | None | None | **Fully static — hardcoded** |
| AI draft + classification | `src/data/conversations.ts` | None | None | **Fully static — hardcoded** |

**To wire this page to live data:**

1. **List endpoint** — add `GET /conversations` to `main.py` that reads all files from `backend/storage/conversations/` and returns summaries:
   ```json
   [{ "lead_id": "...", "lead_name": "...", "last_message": "...", "intent": "objection", "timestamp": "..." }]
   ```

2. **Thread endpoint** — add `GET /conversations/{lead_id}` that returns full message history from `MemoryManager().get_history(lead_id)`

3. **Send reply** — wire the "Send" button to `api.conversationReply(leadId, replyText, context)`
   Response: `{ intent, intent_confidence, response, email_sent }`

4. **Replace static data** — remove `src/data/conversations.ts` import in `ConversationsPage.tsx`, use `useQuery` with the new endpoints

---

### AuditTrailPage

**Route:** `/audit`
**File:** `frontend/src/pages/AuditTrailPage.tsx`

| UI Element | Data Source | API Call | Backend Handler | Status |
|---|---|---|---|---|
| Decision log table | Hardcoded `AUDIT_LOG` array in component | None | `GET /audit/:lead_id` exists but isn't called | **Fully static — hardcoded** |
| Stats (Total decisions, Auto-passed, Human reviewed, Blocked) | Hardcoded strings in component | None | None | **Fully static — hardcoded** |

**To wire this page to live data:**

1. **Add a lead selector** — dropdown or search to pick a lead ID, or show a global log across all leads
2. **Fetch audit trail** — call `api.auditTrail(leadId)` which hits `GET /audit/:lead_id`
3. **Global audit endpoint** — add `GET /audit` (no lead_id) to `main.py` that reads all JSONL files from `backend/storage/audit_logs/` and returns a merged, time-sorted list
4. **Stats** — derive from the fetched entries: count `pass`, `review`, `block` events to populate the GovStatCards

The backend `AuditLogger` already writes entries in this shape:
```json
{ "timestamp": "...", "event_type": "outreach_generated|governance_check|conversation_reply", "lead_id": "...", "status": "pass|review|block", "detail": "...", "actor": "..." }
```

---

### CampaignsPage

**Route:** `/campaigns`
**File:** `frontend/src/pages/CampaignsPage.tsx`

| UI Element | Data Source | API Call | Backend Handler | Status |
|---|---|---|---|---|
| ICP form (industry, funding, tech, roles) | Local React state | None | No endpoint exists | **Fully static — UI only** |
| Outreach sequence steps | Hardcoded in component | None | No endpoint exists | **Fully static — UI only** |
| "Activate Campaign" button | — | Not wired | No endpoint exists | **UI only — not wired** |

**To make campaigns functional:**
1. Add `POST /campaigns` endpoint in `main.py` that accepts the ICP params and sequence config
2. On activation, trigger a batch `leads/search` using the ICP filters, then run `outreach/generate` per lead
3. Save campaign state to `backend/storage/campaigns/{campaign_id}.json`

---

## The full outreach + reply loop (how pieces connect)

```
1. User clicks "Search Leads" on LeadDiscoveryPage
        │ POST /leads/search
        ▼
2. ApolloPeopleService searches Apollo → returns leads
        │
        ▼
3. User clicks a lead row → ResearchPanel opens
        │ GET /company/research/:name
        ▼
4. Returns company data from sample_data/demo_companies.json + computed signals

5. User clicks "Generate Outreach" (currently unwired)
        │ POST /outreach/generate  { lead_id, company_domain }
        ▼
6. main.py orchestrates full pipeline:
   a. apollo_people.get_person_details(lead_id)
   b. apollo_company.enrich_company(domain)
   c. apollo_signals.detect_hiring_trends(org_id)
   d. research_agent.research_company(company, signals)     ← Claude
   e. context_builder.build_lead_context(...)
   f. trend_agent.get_current_trends()
   g. relevance_engine.rank_trends(context, trends, top_k=3) ← Voyage AI
   h. outreach_agent.generate_email(context, top_trends)    ← Claude
   i. risk_engine.evaluate(lead_id, email, source_facts)    ← Tone + Hallucination + Risk
        │
        ├── risk_score < 0.4 → approved → EmailSender.send() via Gmail SMTP
        │                                  LeadContextStore.save(lead_email, lead_id, context)
        │
        └── risk_score ≥ 0.4 → appears in GET /approval-queue

7. Lead replies to the email
        │
        ▼
8. GmailReplyPoller (scripts/run_reply_poller.py) detects reply via IMAP
   Searches: UNSEEN FROM "{lead_email}" SUBJECT "Re:"
        │
        ▼
9. Looks up lead via LeadContextStore.get_by_email(sender_email)
        │
        ▼
10. ConversationAgent.handle_reply(lead_id, reply_text, context)
    a. IntentDetector.classify(reply) → { intent, confidence, key_signal } ← Claude
    b. Routes by intent:
       - unsubscribe      → canned opt-out
       - meeting_request  → Calendly URL
       - objection        → OutreachAgent.respond_to_objection()
       - interested/neutral/fact_question → Claude with context-grounded system prompt
    c. MemoryManager.store_message() — saves both inbound and outbound
    d. EmailSender.send() — sends the response back to the lead
    e. IntentDetector logs event to storage/intent_analytics/events.jsonl
        │
        ▼
11. Result visible in ConversationsPage (currently static — needs wiring, see above)
    and AuditTrailPage (currently static — needs wiring, see above)
```

---

## Where to write new data for new features

| If you want to add... | Write backend logic in | Add route to | Add API call in | Wire in component |
|---|---|---|---|---|
| New KPI to dashboard | `main.py:dashboard_stats()` | Already in `GET /dashboard/stats` | `api.dashboardStats()` already returns it | `DashboardPage.tsx` / `KpiCard` |
| New signal type on pipeline | `main.py:_compute_signals()` | Already returned by `GET /pipeline` | `api.pipeline()` already returns `signals[]` | `PipelinePage.tsx` / `SignalPill` |
| New intent type for conversation | `agents/conversation/intent_detector.py` | Already handled in `POST /conversation/reply` | `api.conversationReply()` already returns `intent` | `ConversationsPage.tsx` draft panel |
| New governance rule | `governance/tone_validator.py` or `governance/risk_engine.py` | Already surfaced in `GET /approval-queue` | `api.approvalQueue()` returns `trigger` and `policy` | `ApprovalQueuePage.tsx` |
| Campaign activation | `main.py` — new `POST /campaigns` | New endpoint needed | New `api.activateCampaign()` in `api.ts` | `CampaignsPage.tsx` Activate button |
| Live conversation list | `main.py` — new `GET /conversations` reading from `storage/conversations/` | New endpoint needed | New `api.listConversations()` in `api.ts` | `ConversationsPage.tsx` left sidebar |
| Live audit trail | `main.py` — new `GET /audit` (global) | New endpoint needed | New `api.globalAuditTrail()` in `api.ts` | `AuditTrailPage.tsx` table |
| Lead state tracking (stage updates) | New `backend/services/lead_state_store.py` | New `POST /pipeline/{lead_id}/stage` | New `api.updateLeadStage()` in `api.ts` | `PipelinePage.tsx` stage chip |

---

---

### DevDashboardPage

**Route:** `/dev`
**File:** `frontend/src/pages/DevDashboardPage.tsx`
**Branch:** `feature/governed-dashboard-phase1`

| UI Panel | Data Source | API Call | Backend Handler | Status |
|---|---|---|---|---|
| Hallucination Root Cause (5 category cards) | `diagnostics.by_category` | `api.devDiagnostics()` | `GET /dev/diagnostics` → `diagnostic_store.get_diagnostics_summary()` | **Live** |
| AI Operations table (success rate, latency, confidence, val. pass rate) | `metrics[agent]` | `api.devAgentMetrics()` | `GET /dev/agent-metrics` → `diagnostic_store.get_agent_metrics()` | **Live** |
| Governance & Validation (allow/block/defer + live feed) | `validations[]` | `api.devValidationLog(30)` | `GET /dev/validation-log` → `diagnostic_store.get_recent_validations()` | **Live** |
| Retrieval & Prompt Intelligence (context coverage, ambiguity, prompt versions) | `traces[]` metadata | `api.devTraces(100)` | `GET /dev/traces` → `diagnostic_store.get_recent_traces()` | **Live** |
| System Insights (latency bottleneck chart, token usage, estimated cost) | `metrics[agent]` | `api.devAgentMetrics()` | Same as AI Operations | **Live** |
| Live Trace Feed (last 20 calls, auto-refresh 10s) | `traces[]` | `api.devTraces(20)` | Same as Retrieval panel | **Live** |

**How observability data flows:**

```
Agent makes Claude call
        │
        ▼
AgentTracer.trace() context manager
  - measures latency + tokens
  - scores context completeness (0–1)
  - scores prompt ambiguity (0–1)
  - fires diagnostic categories
        │
        ▼
Validator.validate()  ← must run INSIDE the with block
  - checks shape, context, policy, business rules
  - writes to validations.jsonl
  - sets consequence: allow / block / defer
        │
        ▼
AgentTracer.__exit__
  - writes to traces.jsonl
        │
        ▼
GET /dev/* endpoints read from JSONL files
        │
        ▼
DevDashboardPage polls every 10s via React Query refetchInterval
```

**To extend the observability dashboard with a new panel:**
1. Add a new query function to `api.ts` calling an existing `/dev/*` endpoint
2. Add a new React component in `DevDashboardPage.tsx`
3. If you need new data, add a new endpoint in `main.py` calling a new helper in `diagnostic_store.py`

**To add a new diagnostic category:**
See `backend/observability/README.md` → "Adding a new diagnostic category".

---

## Known issues / gaps at time of writing

| Issue | Location | Impact |
|---|---|---|
| `AgentFeedCard` was calling `api.recentAgentEvents` which didn't exist | `AgentFeedCard.tsx` + `api.ts` | Agent feed showed empty — **fixed: alias added to api.ts** |
| `ConversationsPage` is fully static | `ConversationsPage.tsx` | Shows fake conversations — needs real API wiring |
| `AuditTrailPage` is fully static | `AuditTrailPage.tsx` | Shows fake audit entries — needs `GET /audit` global endpoint |
| `CampaignsPage` is fully static | `CampaignsPage.tsx` | "Activate Campaign" does nothing — needs `POST /campaigns` endpoint |
| Pipeline `signals[]` always empty | `main.py:_person_to_pipeline_item()` | No signals shown on pipeline — `_compute_signals()` exists but isn't called here |
| Pipeline `stage` always `"new"` | `main.py:_person_to_pipeline_item()` | Stage never updates — no lead state store wired yet |
| Approval queue Approve/Reject not persisted | `ApprovalQueuePage.tsx` | Decisions lost on page refresh — needs backend endpoint |
| "Generate Outreach" button in LeadDiscovery not wired | `LeadDiscoveryPage.tsx` | Button exists but does nothing — needs `api.generateOutreach()` call |
| Dashboard KPI cards and agent feed are static | `main.py:dashboard_stats()` + `main.py:agent_feed_recent()` | Shows hardcoded numbers — Phase 2: derive from storage JSONL files |
