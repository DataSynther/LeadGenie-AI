# LeadGenie AI — System Architecture & Flow Diagrams

> Full picture of every layer, how data moves through the system, and what each component is responsible for.

---

## 1. High-Level System Map

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          FRONTEND  (React + Vite)                        │
│                                                                           │
│  LeadDiscoveryPage ── ResearchPanel ── chip selector ── outreach drawer  │
│  ApprovalQueuePage ── ConversationsPage ── DevDashboard ── AuditTrail    │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │  HTTP (api.ts → main.py)
┌────────────────────────────────▼────────────────────────────────────────┐
│                          BACKEND  (FastAPI)                               │
│                                                                           │
│  ┌──────────────┐  ┌─────────────────┐  ┌──────────────────────────┐    │
│  │ DISCOVERY    │  │  INTELLIGENCE   │  │   MEMORY / KNOWLEDGE     │    │
│  │              │  │                 │  │                           │    │
│  │ Apollo       │  │ TrendAgent      │  │ SenderKnowledgeBase       │    │
│  │  People      │  │ RelevanceEngine │  │ IndustryOutreachMemory    │    │
│  │  Company     │  │ ResearchAgent   │  │ GroundingMemory           │    │
│  │  Signals     │  │ ContextBuilder  │  │ ConversationMemory        │    │
│  └──────┬───────┘  └────────┬────────┘  └────────────┬─────────────┘    │
│         │                   │                         │                  │
│  ┌──────▼───────────────────▼─────────────────────────▼──────────────┐  │
│  │                OUTREACH GENERATION PIPELINE                         │  │
│  │                                                                     │  │
│  │  DomainDetector → TemplateCategorizer → OutreachAgent → Scaffold   │  │
│  │       (domain)         (vertical)         (Claude)      (prompt)   │  │
│  └──────────────────────────────┬──────────────────────────────────── ┘  │
│                                 │                                         │
│  ┌──────────────────────────────▼──────────────────────────────────────┐ │
│  │                    GOVERNANCE LAYER                                   │ │
│  │                                                                       │ │
│  │  GovernanceOrchestrator                                               │ │
│  │    ├── ToneValidator       (rule-based, free)                         │ │
│  │    ├── HallucinationChecker (Claude, ~$0.003)                         │ │
│  │    ├── RiskEngine           (scoring + audit)                         │ │
│  │    └── AuditLogger          (immutable JSONL)                         │ │
│  └──────────────────────────────┬──────────────────────────────────────┘ │
│                                 │                                         │
│  ┌──────────────────────────────▼──────────────────────────────────────┐ │
│  │  POST-GENERATION                                                      │ │
│  │  ApprovalQueue → EmailSender → GmailPoller → ConversationAgent       │ │
│  │                                               └── IntentDetector     │ │
│  │                                               └── Scheduler          │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │  OBSERVABILITY                                                        │ │
│  │  AgentTracer → DiagnosticStore → /dev/* endpoints → DevDashboard     │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Outreach Generation Pipeline (step by step)

```
User selects a lead and clicks "Generate Outreach"
        │
        ▼
┌───────────────────────────────────────────────────────────────────────┐
│  PHASE 1 — SUGGEST  (free, ~1 s, no Claude)                           │
│  POST /outreach/suggest                                                │
│                                                                        │
│  1. Apollo People   ──► get_person_details(lead_id)                   │
│     └─ returns: name, title, headline, org_id, email                  │
│                                                                        │
│  2. Apollo Company  ──► enrich_company(domain)                        │
│     └─ returns: industry, tech stack, revenue, headcount growth       │
│                                                                        │
│  3. DomainDetector  ──► detect(company)                               │
│     └─ keyword rules → domain (fintech/saas/healthcare/…)            │
│        Haiku LLM fallback if industry is ambiguous (~$0.001)          │
│                                                                        │
│  4. TemplateCategorizer ──► categorize(lead, company)                 │
│     └─ keyword rules → vertical (data_engineering/data_science/…)    │
│                                                                        │
│  5. Returns: { vertical, domain, vertical_options[], domain_options[] │
│               top_trends[] }                                           │
└───────────────────────────────────────────────────────────────────────┘
        │
        ▼
UI shows chip selector — user confirms or overrides vertical + domain
        │
        ▼
┌───────────────────────────────────────────────────────────────────────┐
│  PHASE 2 — GENERATE  (paid, ~45-60 s)                                 │
│  POST /outreach/generate  { vertical_override, domain_override }      │
│                                                                        │
│  5. Apollo Signals  ──► detect_hiring_trends(org_id)                  │
│     └─ returns: ai_hiring count, scaling flag, open roles             │
│                                                                        │
│  6. ResearchAgent   ──► research_company(company, signals)  [Claude]  │
│     └─ returns: summary, growth_stage, pain_points, ai_readiness     │
│                                                                        │
│  7. ContextBuilder  ──► build_lead_context(lead, company, …)          │
│     └─ unified dict: lead + company + signals + research              │
│                                                                        │
│  8. TrendAgent      ──► get_current_trends()                          │
│     └─ curated list + RSS feeds → trend store                        │
│                                                                        │
│  9. RelevanceEngine ──► rank_trends(context, trends, top_k=3)         │
│     └─ Voyage AI embeddings → cosine similarity → top 3 trends       │
│                                                                        │
│  10. SenderKnowledgeBase ──► retrieve(vertical, domain, tech, trends) │
│      └─ 5-signal scoring → top 2 KB claim records                    │
│         vertical(0.40) + domain(0.30) + tech(0.20) +                 │
│         generic(0.05) + trend tags(0.10)                              │
│                                                                        │
│  11. IndustryOutreachMemory ──► get_examples(vertical, n=2)           │
│      └─ few-shot hook examples to guide Claude's style                │
│                                                                        │
│  12. build_scaffold_template(vertical, few_shot, kb_claims)           │
│      └─ per-stream scaffold with KB claims + stream context injected  │
└───────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────────────┐
│  GENERATION RETRY LOOP  (max 3 attempts)                              │
│                                                                        │
│  Attempt N                                                             │
│    │                                                                   │
│    ├── OutreachAgent.generate_single()  [Claude Sonnet]               │
│    │   └─ returns: subject, opening_hook, value_prop,                 │
│    │               social_proof, cta, reasoning,                      │
│    │               stream, domain, kb_ids_used                        │
│    │                                                                   │
│    ├── _assemble_body(add_intro=True)                                  │
│    │   └─ prepends fixed sender intro (initial cold email only):      │
│    │      "I'm Prashant Biswas from Ganit…"                          │
│    │   Note: follow-up and objection replies use add_intro=False      │
│    │                                                                   │
│    ├── Validator  (rule-based, free)                                   │
│    │   ├── shape check  — required JSON fields present?               │
│    │   ├── context check — company name mentioned?                    │
│    │   └── policy check — no prohibited content?                      │
│    │                                                                   │
│    └── ToneValidator  (rule-based, free)                               │
│        ├── banned phrases ("guaranteed ROI", "revolutionary"…)        │
│        ├── subject ≤ 8 words                                           │
│        ├── body ≤ 6 sentences                                          │
│        └── ≤ 1 exclamation mark                                        │
│                                                                        │
│    If issues found AND attempt < 3:                                    │
│      ├── shape-only failure → fix_shape() (cheap targeted re-ask)     │
│      └── other failures   → full correction prompt appended           │
└───────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────────────┐
│  HALLUCINATION CHECK  (single call on final output)                   │
│                                                                        │
│  source_facts built from:                                              │
│    - Apollo prospect facts  (company_name, industry, tech, title)     │
│    - GroundingMemory[lead_id]  (full snapshot written pre-generation) │
│    - KB claims text from kb_ids_used  ← Domain B, never flag these   │
│                                                                        │
│  HallucinationChecker (Claude Haiku, ~$0.003)                         │
│    └─ verifies every factual claim in opening_hook + value_prop +    │
│       social_proof against source_facts                               │
│       - Domain A misrepresented → violation                           │
│       - Domain B claim (KB) → now in source_facts → passes           │
│       - Domain C prose → not fact-checked                             │
└───────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────────────┐
│  RISK ENGINE  (rule-based, free)                                       │
│                                                                        │
│  risk_score = weighted sum of:                                         │
│    - tone violations     → +0.20 each                                  │
│    - hallucination flags → +0.35 each                                  │
│    - validation issues   → +0.15 each                                  │
│                                                                        │
│  score < 0.4  → approved → EmailSender.send() via Gmail SMTP          │
│  score ≥ 0.4  → flagged  → lands in ApprovalQueue for human review    │
│                                                                        │
│  AuditLogger writes immutable event to storage/audit_logs/{id}.jsonl  │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 3. Reply Handling Loop

```
Lead replies to outreach email
        │
        ▼
GmailReplyPoller  (scripts/run_reply_poller.py — runs continuously)
  └─ IMAP SEARCH: UNSEEN FROM "{lead_email}" SUBJECT "Re:"
        │
        ▼
LeadContextStore.get_by_email(sender_email)
  └─ looks up lead_id from storage/lead_contexts/{sanitized_email}.json
        │
        ▼
ConversationAgent.handle_reply(lead_id, reply_text, context)
        │
        ├── IntentDetector.classify(reply)  [Claude Haiku]
        │   └─ returns: intent, confidence, key_signal
        │      intents: interested | neutral | fact_question |
        │               objection | meeting_request | unsubscribed
        │
        ├── MemoryManager.store_message()
        │   └─ appends to storage/conversations/{lead_id}.json
        │
        ├── Route by intent:
        │   ├── unsubscribed     → canned opt-out, stop sequence
        │   ├── meeting_request  → Scheduler.generate_scheduling_link()
        │   ├── objection        → OutreachAgent.respond_to_objection(add_intro=False)
        │   └── other            → Claude with two-block system prompt (see below)
        │
        └── EmailSender.send(to=lead_email, subject=..., body=response)
```

### Sender vs recipient fact separation in replies

Every Claude-handled reply (fact_question / neutral / interested) receives a system
prompt with two explicitly labelled fact blocks and a CRITICAL RULE:

```
CRITICAL RULES:
  1. Questions about THEIR company  → use PROSPECT FACTS only.
     Questions about Ganit          → use GANIT'S CAPABILITIES only.
     Never cross-attribute metrics between the two orgs.
  2. Do NOT open with "I'm Prashant Biswas from Ganit…" —
     that intro is for the initial cold email only.

== PROSPECT FACTS (about THEIR organisation — <Company>) ==
  summary, pain points, growth stage, AI readiness...   ← Domain A

== GANIT'S CAPABILITIES (about YOUR organisation) ==
  Ganit identity (Everest/Forrester/Analytics India,
  SOC-2/ISO, AWS 6yr, 300+ team)
  + verified KB proof points matched to this lead's
    vertical + domain + tech stack                       ← Domain B
```

Without this separation, Claude had only one "company" in context (the prospect's)
and would answer "what has your company done for banks?" using the target's own data.

---

## 4. Governance Decision States

```
Email generated
      │
      ▼
 Validator + ToneValidator
      │
      ├─ issues?  ──YES──► correction prompt → retry (max 3 attempts)
      │
      └─ NO
           │
           ▼
    HallucinationChecker
           │
           ├─ violations?  ──YES──► risk score +0.35 per violation
           │
           └─ NO
                │
                ▼
          RiskEngine score
                │
                ├── < 0.40  ──► approved: true  → auto-send
                │                              → AuditLogger: "pass"
                │
                └── ≥ 0.40  ──► approved: false → ApprovalQueue
                                               → AuditLogger: "review"
                                                      │
                                             Human reviews email
                                                      │
                                        ┌─────────────┴──────────────┐
                                        │                            │
                                   Approve & Send               Reject
                                  AuditLogger: "approved"   AuditLogger: "rejected"
                                  EmailSender.send()
```

---

## 5. Sender Knowledge Base — Retrieval Flow

```
OutreachAgent._build_base_prompt()
        │
        ├── vertical = TemplateCategorizer.categorize(lead, company)
        │   keyword rules on title + headline → data_science | data_engineering
        │                                        product | devops | generic
        │
        ├── domain = DomainDetector.detect(company)
        │   keyword rules on industry + name → fintech | healthcare | ecommerce
        │     │                                 saas | logistics | telecom
        │     └── ambiguous? → Haiku LLM call (~$0.001) for classification
        │
        └── SenderKnowledgeBase.retrieve(vertical, domain, technologies, trend_tags, n=2)
                │
                │   For every record in knowledge_base/*.jsonl:
                │
                │   score = 0
                │   + 0.40  if record.vertical == stream
                │   + 0.30  if record.domain   == domain
                │   + 0.10  per matching technology (max 2 matches → max 0.20)
                │   + 0.05  if record.domain   == "generic"
                │   + 0.05  per matching trend tag   (max 2 matches → max 0.10)
                │
                └── top n by score → get_claims_text(ids) → injected as {kb_section}
                                                             into scaffold prompt
```

---

## 6. Observability Flow

```
Any Claude agent call (outreach / research / conversation / intent)
        │
        ▼
AgentTracer.trace(prompt, system)  ← context manager
  Scores on entry:
    - context_completeness  (0–1) — required fields present?
    - prompt_ambiguity      (0–1) — vague language density
  Times the call.
        │
        ▼
client.messages.create()  ← actual Claude API call
        │
        ▼
t.finish(response)  +  Validator.validate(result, tracker=t)
  Records:
    - latency_ms, token usage
    - validation consequence (allow / block / defer)
    - retrieval score (if provided)
    - self-evaluation score (if run)
    - diagnostic categories fired:
        retrieval_failure     → retrieval_score < 0.55
        insufficient_context  → context_completeness < 0.50
        ambiguous_prompt      → prompt_ambiguity > 0.30
        validation_gap        → Validator not called inside with block
        task_model_mismatch   → model confidence < 0.65
        │
        ▼
DiagnosticStore.write_trace()    → storage/diagnostics/traces.jsonl
DiagnosticStore.write_validation() → storage/diagnostics/validations.jsonl
        │
        ▼
GET /dev/diagnostics · /dev/agent-metrics · /dev/traces · /dev/validation-log
        │
        ▼
DevDashboard  (http://localhost:5173/dev)  auto-refreshes every 10 s
```

---

## 7. Component Quick Reference

| Component | File | What it does | Cost |
|---|---|---|---|
| **ApolloPeopleService** | `services/apollo/apollo_people.py` | Search + enrich leads from Apollo | Apollo API credits |
| **ApolloCompanyService** | `services/apollo/apollo_company.py` | Enrich company by domain | Apollo API credits |
| **ApolloSignalsService** | `services/apollo/apollo_signals.py` | Extract hiring signals from job postings | Apollo API credits |
| **ResearchAgent** | `agents/research/research_agent.py` | Company research brief via Claude | ~$0.003 (Sonnet) |
| **ContextBuilder** | `agents/research/context_builder.py` | Assembles unified lead context dict | Free |
| **TrendAgent** | `agents/trends/trend_agent.py` | Loads curated + RSS market trends | Free |
| **RelevanceEngine** | `agents/relevance/relevance_engine.py` | Voyage AI embeddings → top-k trend ranking | ~$0.0001 (Voyage) |
| **DomainDetector** | `agents/outreach/template_categorizer.py` | Maps company industry → domain (fintech/saas/…) | Free (Haiku fallback ~$0.001) |
| **TemplateCategorizer** | `agents/outreach/template_categorizer.py` | Maps lead title → vertical (data_eng/devops/…) | Free |
| **SenderKnowledgeBase** | `memory/sender_kb.py` | Retrieves verified Ganit proof points for prompt | Free |
| **IndustryOutreachMemory** | `memory/industry_outreach_memory.py` | Few-shot hook examples per vertical | Free |
| **OutreachAgent** | `agents/outreach/outreach_agent.py` | Generates email via Claude Sonnet | ~$0.010 (Sonnet) |
| **GovernanceOrchestrator** | `governance/orchestrator.py` | Retry loop + single hallucination check | Included above |
| **ToneValidator** | `governance/tone_validator.py` | Banned phrases, length, punctuation rules | Free |
| **HallucinationChecker** | `governance/hallucination_checker.py` | Claude verifies claims vs source facts + KB | ~$0.003 (Sonnet) |
| **RiskEngine** | `governance/risk_engine.py` | Composite risk score, approve/flag decision | Free |
| **AuditLogger** | `governance/audit_logger.py` | Immutable JSONL audit trail per lead | Free |
| **IntentDetector** | `agents/conversation/intent_detector.py` | Classifies reply intent (Haiku) | ~$0.001 (Haiku) |
| **ConversationAgent** | `agents/conversation/conversation_agent.py` | Routes and responds to inbound replies; injects two-block system prompt (PROSPECT FACTS vs GANIT'S CAPABILITIES) to prevent sender/recipient fact confusion; suppresses sender intro in replies | ~$0.004 (Sonnet) |
| **MemoryManager** | `agents/conversation/memory_manager.py` | Per-lead conversation history JSONL | Free |
| **GroundingMemory** | `agents/conversation/memory_manager.py` | Pre-generation fact snapshot per lead | Free |
| **Scheduler** | `scheduling/scheduler.py` | Calendly booking links + meeting copy | Calendly API |
| **EmailSender** | `services/email_sender.py` | Sends via Gmail SMTP | Free |
| **GmailReplyPoller** | `scripts/run_reply_poller.py` | IMAP watcher for inbound replies | Free |
| **AgentTracer** | `observability/agent_tracer.py` | Instruments every Claude call | Free |
| **Validator** | `observability/validator.py` | Shape / context / policy / business rules | Free |
| **DiagnosticStore** | `observability/diagnostic_store.py` | JSONL persistence for traces + validations | Free |
| **FeedbackCollector** | `learning/feedback_collector.py` | Records interaction outcomes | Free |
| **LearningEngine** | `learning/learning_engine.py` | Pattern analysis + guided improvement | ~$0.003 (Sonnet) |

---

## 8. Three-Domain Fact Boundary

Every factual claim in a generated email belongs to exactly one domain:

```
┌──────────────────────────────────────────────────────────┐
│  Domain A — PROSPECT FACTS                                │
│  Source: Apollo API + ResearchAgent                       │
│  Rule:   READ ONLY — cite exactly, never invent           │
│  Examples: company name, industry, tech stack, headcount │
│            growth, lead title, recent roles               │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  Domain B — SENDER KB CLAIMS                              │
│  Source: backend/storage/knowledge_base/*.jsonl           │
│  Rule:   CITE EXACTLY — include metric verbatim           │
│          Claude returns kb_ids_used[] so every claim     │
│          is traceable back to its source record          │
│  Examples: "50% Databricks cost reduction for a fintech" │
│            "74% fraud reduction for a digital bank"      │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  Domain C — GENERATIVE CONTENT                            │
│  Source: Claude                                           │
│  Rule:   WRITE FREELY — transitions, framing, CTA prose  │
│  Examples: "I noticed your team is scaling fast…"        │
│            "Would you be open to a 20-minute call?"      │
└──────────────────────────────────────────────────────────┘
```

The hallucination checker only flags Domain A misrepresentations. Domain B claims are fed into `source_facts` via `kb_ids_used` before the check runs, so they are treated as verified. Domain C is not fact-checked.

---

## 9. Storage Layout

```
backend/storage/
├── audit_logs/                  # Immutable governance decisions
│   └── {lead_id}.jsonl
├── conversations/               # Per-lead message history
│   └── {lead_id}.json
├── diagnostics/                 # Observability traces
│   ├── traces.jsonl             # One line per Claude call
│   └── validations.jsonl        # One line per validation event
├── feedback/
│   └── outcomes.jsonl           # Interaction outcomes (meeting/reply/unsub)
├── industry_memory/             # Few-shot examples per vertical
│   └── {vertical}.jsonl
├── intent_analytics/
│   └── events.jsonl             # Intent classification log
├── knowledge_base/              # Sender proof-point KB (Domain B)
│   ├── data_science.jsonl       # 31 records — ML/AI case studies
│   ├── data_engineering.jsonl   #  8 records — pipeline / lakehouse
│   └── generic.jsonl            #  6 records — certs, awards, differentiators
└── lead_contexts/               # Email → lead context map
    └── {sanitized_email}.json
```
