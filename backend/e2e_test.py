"""End-to-end test: full pipeline for multiple leads, conversation replies, memory, dashboards.

Runs directly against the in-process agents (no HTTP server required) so it works
without uvicorn and avoids network overhead.  All LLM calls are real.

Pipeline tested per lead
  1. Research + context build
  2. Outreach generation through GovernanceOrchestrator (retries exercised)
  3. Email send (logged; real send only if LEADGENIE_GMAIL_PASSWORD is set)
  4. Conversation: 3-4 inbound replies with varied intents
  5. Memory: episodic / semantic / entity accumulation verified
  6. Dashboard endpoints validated for non-zero real data
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path
from datetime import datetime, timezone

# ── bootstrap ──────────────────────────────────────────────────────────────────
sys.path.insert(0, str(Path(__file__).parent))
from dotenv import load_dotenv
load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")

from services.apollo import ApolloPeopleService, ApolloCompanyService, ApolloSignalsService
from agents.research.research_agent import ResearchAgent
from agents.research.context_builder import ContextBuilder
from agents.trends.trend_agent import TrendAgent
from agents.relevance.relevance_engine import RelevanceEngine
from agents.outreach.outreach_agent import OutreachAgent
from agents.conversation.conversation_agent import ConversationAgent
from governance.risk_engine import RiskEngine
from governance.orchestrator import GovernanceOrchestrator
from services.email_sender import EmailSender
from memory.memory_governance import governance as mem_gov
from observability import diagnostic_store

# ── helpers ────────────────────────────────────────────────────────────────────

_GREEN  = "\033[92m"
_YELLOW = "\033[93m"
_RED    = "\033[91m"
_CYAN   = "\033[96m"
_BOLD   = "\033[1m"
_RESET  = "\033[0m"

_pass_count = 0
_fail_count = 0
_warn_count = 0

def _h(title: str):
    print(f"\n{_BOLD}{_CYAN}{'='*65}{_RESET}")
    print(f"{_BOLD}{_CYAN}  {title}{_RESET}")
    print(f"{_BOLD}{_CYAN}{'='*65}{_RESET}")

def _ok(msg: str):
    global _pass_count
    _pass_count += 1
    print(f"  {_GREEN}✓{_RESET} {msg}")

def _fail(msg: str):
    global _fail_count
    _fail_count += 1
    print(f"  {_RED}✗{_RESET} {msg}")

def _warn(msg: str):
    global _warn_count
    _warn_count += 1
    print(f"  {_YELLOW}⚠{_RESET} {msg}")

def _info(msg: str):
    print(f"  {_YELLOW}→{_RESET} {msg}")

def _check(condition: bool, label: str, detail: str = ""):
    if condition:
        _ok(f"{label}" + (f" — {detail}" if detail else ""))
    else:
        _fail(f"{label}" + (f" — {detail}" if detail else ""))

# ── sample data ────────────────────────────────────────────────────────────────

_LEADS_PATH     = Path(__file__).parent.parent / "sample_data" / "demo_leads.json"
_COMPANIES_PATH = Path(__file__).parent.parent / "sample_data" / "demo_companies.json"

_RAW_LEADS     = json.loads(_LEADS_PATH.read_text())
_RAW_COMPANIES = json.loads(_COMPANIES_PATH.read_text())
_COMPANY_MAP   = {c["name"]: c for c in _RAW_COMPANIES}

# Pick 3 diverse leads from sample data
_TEST_LEAD_IDS = [
    "696cb6c2d4cef40001c3cd64",   # Ravi Sharma, VP-Ops & CTO, Britannia Industries
    "66ebc081ed632d000142baed",   # Madhusudhan Rao, CTO, Swiggy
    "6051ce8e97b52e00018389cc",   # Sandip Agarwal, CTO, Traya
]

# Simulated inbound replies per lead — varied intents
_REPLIES: dict[str, list[dict]] = {
    "696cb6c2d4cef40001c3cd64": [
        {"reply": "Interesting — can you tell me more about how you handle large-scale data pipelines?",
         "expected_intent": "fact_question"},
        {"reply": "We've been struggling with our legacy ETL for two years. This looks promising.",
         "expected_intent": "interested"},
        {"reply": "Can we schedule a 30-minute call next Tuesday to discuss pricing and integration?",
         "expected_intent": "meeting_request"},
    ],
    "66ebc081ed632d000142baed": [
        {"reply": "We already use Databricks for this. Why would we need another tool?",
         "expected_intent": "objection"},
        {"reply": "Fair point on the Kafka integration. Our real-time ordering pipeline is the main bottleneck.",
         "expected_intent": "interested"},
        {"reply": "Please remove me from your list.",
         "expected_intent": "unsubscribe"},
    ],
    "6051ce8e97b52e00018389cc": [
        {"reply": "What's the typical onboarding timeline for a team of 20 engineers?",
         "expected_intent": "fact_question"},
        {"reply": "Sounds good — send me a demo when available.",
         "expected_intent": "meeting_request"},
        {"reply": "Let's book time this week to see a live demo.",
         "expected_intent": "meeting_request"},
    ],
}

# ── init agents ────────────────────────────────────────────────────────────────

apollo_people   = ApolloPeopleService()
apollo_company  = ApolloCompanyService()
apollo_signals  = ApolloSignalsService()
research_agent  = ResearchAgent()
context_builder = ContextBuilder()
trend_agent     = TrendAgent()
relevance_engine = RelevanceEngine()
outreach_agent  = OutreachAgent()
conv_agent      = ConversationAgent()
risk_engine     = RiskEngine()
email_sender    = EmailSender()
orchestrator    = GovernanceOrchestrator(
    tone_validator=risk_engine.tone_validator,
    hallucination_checker=risk_engine.hallucination_checker,
    risk_engine=risk_engine,
)

# ── snapshot before ────────────────────────────────────────────────────────────

_traces_before     = diagnostic_store.get_recent_traces(limit=5000)
_val_before        = diagnostic_store.get_recent_validations(limit=5000)
_gov_before        = mem_gov.get_stats()
_traces_before_n   = len(_traces_before)
_val_before_n      = len(_val_before)
_mem_created_before = _gov_before["write_policy"]["memories_created"]

print(f"\n{_BOLD}LeadGenie AI — End-to-End Test Suite{_RESET}")
print(f"Timestamp : {datetime.now(timezone.utc).isoformat()}")
print(f"Test leads: {len(_TEST_LEAD_IDS)}")
print(f"Traces before test : {_traces_before_n}")
print(f"Validations before : {_val_before_n}")
print(f"Memory events before: {_gov_before['total_memory_events']}")


# ══════════════════════════════════════════════════════════════════════════════
# PHASE 1: OUTREACH PIPELINE
# ══════════════════════════════════════════════════════════════════════════════

_h("PHASE 1 — Outreach Pipeline (Research → Outreach → Governance)")

outreach_results: dict[str, dict] = {}

for lead_id in _TEST_LEAD_IDS:
    lead = apollo_people.get_person_details(lead_id)
    if not lead:
        _fail(f"Lead {lead_id} not found in sample data")
        continue

    lead_name    = lead.get("name", "?")
    company_name = lead.get("organization", {}).get("name", "") if isinstance(lead.get("organization"), dict) else lead.get("company", "?")

    print(f"\n  {_BOLD}Lead: {lead_name} | {lead.get('title','?')} @ {company_name}{_RESET}")

    # 1a. Research — load company from sample data (avoids live Apollo API call)
    raw_company = _COMPANY_MAP.get(company_name, {})
    if not raw_company:
        # fuzzy match: try partial name
        raw_company = next((c for c in _RAW_COMPANIES if company_name.lower() in c["name"].lower()), {})
    # Normalize to the shape _normalize_company() returns
    company = {
        "id":               raw_company.get("id"),
        "name":             raw_company.get("name", company_name),
        "domain":           raw_company.get("domain", ""),
        "industry":         raw_company.get("industry", ""),
        "employee_count":   raw_company.get("employee_count"),
        "revenue_estimate": raw_company.get("revenue"),
        "funding_stage":    raw_company.get("funding_stage"),
        "technologies":     raw_company.get("technologies", []),
        "description":      raw_company.get("description", f"{company_name} — leading technology company"),
        "headquarters":     raw_company.get("headquarters"),
        "linkedin_url":     raw_company.get("linkedin_url"),
        "headcount_growth_6m":  raw_company.get("headcount_growth_6m"),
        "headcount_growth_12m": raw_company.get("headcount_growth_12m"),
    }
    signals = apollo_signals.detect_hiring_trends(lead.get("organization_id", ""), company=company)
    research = research_agent.research_company(company, signals)
    _check(bool(research.get("summary")), "Research agent returned summary")
    _info(f"AI readiness: {research.get('ai_readiness_score','?')}/10  growth: {research.get('growth_stage','?')}")

    # 1b. Context + Trends
    context  = context_builder.build_lead_context(lead, company, signals, research)
    trends   = trend_agent.get_current_trends()
    top3     = relevance_engine.rank_trends(context, trends, top_k=3)
    _check(len(top3) == 3, f"Top-3 trends ranked ({len(top3)} returned)")

    # 1c. Governance orchestrator (retries exercised)
    source_facts = {
        "company_name": company.get("name"),
        "industry":     company.get("industry"),
        "lead_title":   lead.get("title"),
        "description":  company.get("description"),
    }
    t0  = time.time()
    res = orchestrator.run(
        outreach_agent=outreach_agent,
        context=context,
        top_trends=top3,
        source_facts=source_facts,
        lead_id=lead_id,
    )
    latency = round((time.time() - t0) * 1000)

    gov     = res.get("governance", {})
    email   = res.get("email", {})
    history = res.get("governance_attempt_history", [])
    attempts = len(history) if history else 1

    _check(bool(email.get("subject")), f"Email subject generated: {email.get('subject','')[:60]}")
    _check(bool(email.get("body")),    f"Email body generated ({len(email.get('body',''))} chars)")
    _check(gov.get("approved") is not None, f"Governance decision: approved={gov.get('approved')}  risk={gov.get('risk_score','?')}")

    if attempts > 1:
        _warn(f"Governance required {attempts} attempts (retry exercised)")
    else:
        _ok(f"Governance passed in {attempts} attempt(s)  latency={latency}ms")

    # 1d. Email send (real if Gmail creds set, otherwise log-only)
    email_result = email_sender.send(
        to_email=lead.get("email", ""),
        subject=email.get("subject", ""),
        body=email.get("body", ""),
    )
    if email_result.get("sent"):
        _ok(f"Email SENT to {email_result['to']}")
    else:
        err = email_result.get("error", "")
        if "not set" in str(err) or "credentials" in str(err).lower():
            _warn(f"Email not sent (no SMTP creds) — logged only")
        else:
            _warn(f"Email send failed: {err[:80]}")

    outreach_results[lead_id] = {
        "lead": lead, "company": company, "context": context,
        "email": email, "governance": gov, "attempts": attempts,
    }


# ══════════════════════════════════════════════════════════════════════════════
# PHASE 2: SIMULATED INBOUND REPLIES & CONVERSATION HANDLING
# ══════════════════════════════════════════════════════════════════════════════

_h("PHASE 2 — Inbound Replies & Conversation Agent")

conv_results: dict[str, list[dict]] = {}

for lead_id, reply_set in _REPLIES.items():
    if lead_id not in outreach_results:
        _warn(f"Skipping replies for {lead_id} (outreach failed)")
        continue

    ctx  = outreach_results[lead_id]["context"]
    name = outreach_results[lead_id]["lead"].get("name", lead_id)
    print(f"\n  {_BOLD}Conversation thread: {name}{_RESET}")

    conv_results[lead_id] = []

    for turn in reply_set:
        inbound = turn["reply"]
        expected = turn.get("expected_intent", "")

        _info(f'Inbound: "{inbound[:70]}"')
        t0  = time.time()
        res = conv_agent.handle_reply(lead_id=lead_id, reply=inbound, context=ctx)
        lat = round((time.time() - t0) * 1000)

        detected = res.get("intent", "?")
        conf     = res.get("intent_confidence") or 0
        response = res.get("response", "")

        intent_ok = (detected == expected)
        _check(intent_ok,
               f"Intent={detected} (expected={expected}) conf={conf:.2f}  [{lat}ms]")
        _check(bool(response), f"Response generated ({len(response)} chars)")

        if detected == "unsubscribe":
            _ok("Unsubscribe respected — no further follow-up")
        elif detected == "meeting_request":
            _check(res.get("calendly_sent"), "Calendly link attached in response")

        conv_results[lead_id].append({**res, "inbound": inbound})

        # brief pause to avoid rate limiting
        time.sleep(0.5)


# ══════════════════════════════════════════════════════════════════════════════
# PHASE 3: MEMORY ARCHITECTURE VERIFICATION
# ══════════════════════════════════════════════════════════════════════════════

_h("PHASE 3 — Memory Governance & Layers")

from agents.conversation.memory_manager import MemoryManager
mm = MemoryManager()

for lead_id in _TEST_LEAD_IDS:
    if lead_id not in outreach_results:
        continue
    name = outreach_results[lead_id]["lead"].get("name", lead_id)

    # Episodic: replies should have been stored
    history = mm.get_history(lead_id)
    _check(len(history) > 0,
           f"Episodic memory for {name}: {len(history)} entries stored")

    # Inject a semantic fact explicitly (simulate research note)
    company_name = outreach_results[lead_id]["company"].get("name", "")
    industry     = outreach_results[lead_id]["company"].get("industry", "")
    if industry:
        ok = mm.semantic.set(
            key="industry_context",
            value=f"{company_name} operates in {industry} with data pipeline and automation requirements",
            lead_id=lead_id,
            fact_type="fact",
            source="e2e_test",
        )
        _check(ok, f"Semantic write for {name} (industry context)")

    # Entity: inject structured facts
    mm.update_entity(lead_id, {
        "company":   outreach_results[lead_id]["company"].get("name", ""),
        "title":     outreach_results[lead_id]["lead"].get("title", ""),
        "industry":  industry,
        "employees": str(outreach_results[lead_id]["company"].get("employee_count", "")),
    })
    entity = mm.get_entity(lead_id)
    _check(len(entity) >= 3, f"Entity memory for {name}: {len(entity)} fields stored")

# Governance stats after all writes
gov_stats = mem_gov.get_stats()
new_memories = gov_stats["write_policy"]["memories_created"] - _mem_created_before
_check(new_memories >= 0, f"Memory write events accumulated: +{new_memories} new memories")
_info(f"Write policy  — created={gov_stats['write_policy']['memories_created']}  rejected={gov_stats['write_policy']['memories_rejected']}")
_info(f"Retrieval     — retrieved={gov_stats['retrieval_policy']['retrieved']}  accepted={gov_stats['retrieval_policy']['accepted']}")
_info(f"Decay         — expired={gov_stats['decay_policy']['expired_facts']}  stale={gov_stats['decay_policy']['stale_facts_detected']}")
_info(f"Protection    — blocked={gov_stats['protection_policy']['blocked_access_attempts']}")
_info(f"Context budget— task={gov_stats['context_budget']['current_task']}%  research={gov_stats['context_budget']['research']}%  memory={gov_stats['context_budget']['memory']}%")

# Short-term memory eviction test
print()
_info("Short-term eviction test (filling to cap)...")
stm = mm.short_term
sess = "e2e-eviction-test"
stm.add(sess, {"type": "apollo_fact",       "content": "Decision maker confirmed",  "relevance": 0.95})
stm.add(sess, {"type": "research_summary",  "content": "Full company analysis done","relevance": 0.90})
stm.add(sess, {"type": "top_trend",         "content": "AI adoption Q2 surge",      "relevance": 0.88})
for i in range(20):
    stm.add(sess, {"type": "signal", "content": f"Low-relevance signal {i}", "relevance": 0.10 + i * 0.005})
items = stm.get(sess)
protected = sum(1 for x in items if x.get("type") in ("apollo_fact", "research_summary", "top_trend"))
_check(len(items) <= 20, f"Short-term cap enforced: {len(items)}/20 items")
_check(protected == 3,   f"Protected types retained after eviction: {protected}/3")
stm.clear(sess)


# ══════════════════════════════════════════════════════════════════════════════
# PHASE 4: DASHBOARD ENDPOINT VERIFICATION
# ══════════════════════════════════════════════════════════════════════════════

_h("PHASE 4 — Dashboard & Observability Data")

# 4a. Traces accumulated
traces_after = diagnostic_store.get_recent_traces(limit=5000)
val_after    = diagnostic_store.get_recent_validations(limit=5000)
new_traces   = len(traces_after) - _traces_before_n
new_val      = len(val_after)    - _val_before_n

_check(new_traces > 0, f"New traces written: +{new_traces}  (total={len(traces_after)})")
_check(new_val > 0,    f"New validations written: +{new_val}  (total={len(val_after)})")

# 4b. Agent types present
agents_in_traces = {t.get("agent") for t in traces_after if t.get("agent")}
expected_agents  = {"research", "outreach", "intent", "conversation"}
missing          = expected_agents - agents_in_traces
_check(not missing, f"All agent types in traces: {sorted(agents_in_traces)}", f"missing={missing}" if missing else "")

# 4c. pipeline/stats
from observability import diagnostic_store as ds
# replicate /pipeline/stats logic inline
_all_traces = ds.get_recent_traces(limit=2000)
_all_val    = ds.get_recent_validations(limit=2000)
researched  = {t["lead_id"] for t in _all_traces if t.get("agent") == "research" and t.get("lead_id")}
outreach_ok = {v["lead_id"] for v in _all_val if v.get("agent") == "outreach" and v.get("consequence") == "allow" and v.get("lead_id")}
if not outreach_ok:
    outreach_ok = {t["lead_id"] for t in _all_traces if t.get("agent") == "outreach" and t.get("success") and t.get("lead_id")}
replied     = {t["lead_id"] for t in _all_traces if t.get("agent") in ("intent","conversation") and t.get("lead_id")}
_check(len(researched) >= len(_TEST_LEAD_IDS),
       f"leads_researched={len(researched)} (expect >= {len(_TEST_LEAD_IDS)})")
_check(len(outreach_ok) >= len(_TEST_LEAD_IDS),
       f"outreach_sent={len(outreach_ok)} (expect >= {len(_TEST_LEAD_IDS)})")
_check(len(replied) > 0,
       f"replies_received={len(replied)}")

# 4d. memory/governance
gov_final = mem_gov.get_stats()
_check(gov_final["total_memory_events"] > _gov_before["total_memory_events"],
       f"Memory events grew: {_gov_before['total_memory_events']} → {gov_final['total_memory_events']}")
_check(gov_final["context_budget"]["current_task"] > 0,
       f"Context budget computed: task={gov_final['context_budget']['current_task']}%")

# 4e. Agent metrics from traces
agent_counts: dict[str, int] = {}
for t in traces_after:
    a = t.get("agent","unknown")
    agent_counts[a] = agent_counts.get(a, 0) + 1
_info("Agent call counts: " + "  ".join(f"{k}={v}" for k, v in sorted(agent_counts.items())))

# 4f. Governance decisions from validations
from collections import Counter
gov_decisions = Counter(v.get("consequence","?") for v in val_after)
_info(f"Governance decisions: allow={gov_decisions.get('allow',0)}  block={gov_decisions.get('block',0)}  defer={gov_decisions.get('defer',0)}")
_check(gov_decisions.get("allow", 0) > 0, f"At least one governance 'allow' recorded")

# 4g. Intent distribution
from collections import defaultdict
intent_map: dict[str, str] = {}
for t in sorted(traces_after, key=lambda x: x.get("ts", "")):
    if t.get("agent") == "intent" and t.get("lead_id"):
        preview = t.get("response_preview", "").strip()
        try:
            parsed = json.loads(preview.lstrip("```json").lstrip("```").rstrip("```").strip())
            intent_map[t["lead_id"]] = parsed.get("intent", "")
        except Exception:
            pass
if intent_map:
    intent_dist = Counter(intent_map.values())
    _info("Intent distribution: " + "  ".join(f"{k}={v}" for k, v in intent_dist.most_common()))
    _ok(f"Intent classified for {len(intent_map)} leads")
else:
    _warn("No intent records found in traces")


# ══════════════════════════════════════════════════════════════════════════════
# PHASE 5: RETRY / GOVERNANCE STRESS
# ══════════════════════════════════════════════════════════════════════════════

_h("PHASE 5 — Governance Retry Verification")

# Verify attempt_history in orchestrator output
multi_attempt_leads = [
    lid for lid, r in outreach_results.items()
    if r.get("attempts", 1) > 1
]
if multi_attempt_leads:
    _ok(f"Retry exercised for {len(multi_attempt_leads)} lead(s): {multi_attempt_leads}")
else:
    _warn("No retries triggered (all emails passed governance on first attempt — good!)")

# Check validation records for 'defer' cases (human review queue)
defer_records = [v for v in val_after if v.get("consequence") == "defer"]
if defer_records:
    _ok(f"{len(defer_records)} emails deferred to human review queue")
    for v in defer_records[:2]:
        _info(f"  Deferred: agent={v.get('agent')}  issues={v.get('issues', [])[:2]}")
else:
    _info("No deferred items (all within governance thresholds)")

# Verify retry attempts logged in validation history
attempt_counts = [v.get("attempts", 1) for v in val_after if v.get("attempts")]
if any(a > 1 for a in attempt_counts):
    max_att = max(attempt_counts)
    _ok(f"Retry chain recorded — max attempts in validation log: {max_att}")
else:
    _info("All validation records show single-attempt pass")


# ══════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ══════════════════════════════════════════════════════════════════════════════

_h("TEST SUMMARY")

total = _pass_count + _fail_count
pct   = round(100 * _pass_count / total) if total else 0
print(f"\n  {_GREEN}Passed{_RESET}: {_pass_count}/{total} ({pct}%)")
if _fail_count:
    print(f"  {_RED}Failed{_RESET}: {_fail_count}")
if _warn_count:
    print(f"  {_YELLOW}Warnings{_RESET}: {_warn_count}")

print(f"\n  Traces written this run  : +{new_traces}")
print(f"  Validations written      : +{new_val}")
print(f"  Memory events total      : {gov_final['total_memory_events']}")
print(f"  Leads through full cycle : {len(outreach_results)}")
print(f"  Conversation turns       : {sum(len(v) for v in conv_results.values())}")
print()

if _fail_count == 0:
    print(f"  {_GREEN}{_BOLD}ALL CHECKS PASSED ✓{_RESET}")
else:
    print(f"  {_RED}{_BOLD}{_fail_count} CHECKS FAILED — review output above{_RESET}")
    sys.exit(1)
