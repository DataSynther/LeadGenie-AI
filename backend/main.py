from pathlib import Path
from dotenv import load_dotenv
load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")

import json
import logging
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

logger = logging.getLogger(__name__)

_COMPANIES_PATH = Path(__file__).parent.parent / "sample_data" / "demo_companies.json"
_SAMPLE_COMPANIES: list[dict] = json.loads(_COMPANIES_PATH.read_text(encoding="utf-8")) if _COMPANIES_PATH.exists() else []

from services.apollo import ApolloPeopleService, ApolloCompanyService, ApolloSignalsService
from agents.research.research_agent import ResearchAgent
from agents.research.context_builder import ContextBuilder
from agents.trends.trend_agent import TrendAgent
from agents.relevance.relevance_engine import RelevanceEngine
from agents.outreach.outreach_agent import OutreachAgent
from agents.conversation.conversation_agent import ConversationAgent
from governance.risk_engine import RiskEngine
from governance.orchestrator import GovernanceOrchestrator
from learning.feedback_collector import FeedbackCollector
from learning.learning_engine import LearningEngine
from scheduling.scheduler import Scheduler
from services.lead_context_store import LeadContextStore
from observability import diagnostic_store
from memory.memory_governance import governance as memory_governance

app = FastAPI(
    title="LeadGenie AI — Governed Adaptive SDR Platform",
    description="Autonomous, governed, market-aware AI sales development platform.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

apollo_people = ApolloPeopleService()
apollo_company = ApolloCompanyService()
apollo_signals = ApolloSignalsService()
research_agent = ResearchAgent()
context_builder = ContextBuilder()
trend_agent = TrendAgent()
relevance_engine = RelevanceEngine()
outreach_agent = OutreachAgent()
conversation_agent = ConversationAgent()
risk_engine = RiskEngine()
governance_orchestrator = GovernanceOrchestrator(
    tone_validator=risk_engine.tone_validator,
    hallucination_checker=risk_engine.hallucination_checker,
    risk_engine=risk_engine,
)
feedback_collector = FeedbackCollector()
learning_engine = LearningEngine()
scheduler = Scheduler()
lead_context_store = LeadContextStore()


class LeadSearchRequest(BaseModel):
    company_names: list[str] = []
    titles: list[str] = []
    seniorities: list[str] = ["director", "vp", "c_suite"]
    per_page: int = 10


class OutreachRequest(BaseModel):
    lead_id: str
    company_domain: str


class ConversationRequest(BaseModel):
    lead_id: str
    reply: str
    context: dict


class FeedbackRequest(BaseModel):
    lead_id: str
    outcome: str
    metadata: Optional[dict] = None


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "version": "1.0.0"}


@app.post("/leads/search")
async def search_leads(req: LeadSearchRequest):
    try:
        return apollo_people.search_people(req.model_dump())
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Apollo API error: {e}")


@app.get("/company/enrich")
async def enrich_company(domain: str):
    company = apollo_company.enrich_company(domain)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


@app.post("/outreach/generate")
async def generate_outreach(req: OutreachRequest):
    """Full pipeline: enrich → research → trends → relevance → outreach → governance."""
    lead = apollo_people.get_person_details(req.lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    company = apollo_company.enrich_company(req.company_domain)
    signals = apollo_signals.detect_hiring_trends(lead.get("organization_id", ""))
    research = research_agent.research_company(company, signals)
    context = context_builder.build_lead_context(lead, company, signals, research)

    trends = trend_agent.get_current_trends()
    top_trends = relevance_engine.rank_trends(context, trends, top_k=3)

    source_facts = {
        "company_name": company.get("name"),
        "industry": company.get("industry"),
        "lead_title": lead.get("title"),
        "description": company.get("description"),
        "employee_count": company.get("employee_count"),
        "technologies": company.get("technologies", []),
    }

    result = governance_orchestrator.run(
        outreach_agent=outreach_agent,
        context=context,
        top_trends=top_trends,
        source_facts=source_facts,
        lead_id=req.lead_id,
    )

    return {
        "lead": lead,
        "company": company,
        "top_trends": top_trends,
        "email": result["email"],
        "governance": result["governance"],
        "governance_attempt_history": result["governance_attempt_history"],
    }


@app.post("/conversation/reply")
async def handle_reply(req: ConversationRequest):
    return conversation_agent.handle_reply(req.lead_id, req.reply, req.context)


@app.post("/feedback/record")
async def record_feedback(req: FeedbackRequest):
    feedback_collector.record_outcome(req.lead_id, req.outcome, req.metadata)
    return {"status": "recorded"}


@app.get("/learning/analytics")
async def get_analytics():
    return learning_engine.analyze_patterns()


@app.get("/trends")
async def get_trends():
    return trend_agent.get_current_trends()


@app.get("/audit/{lead_id}")
async def get_audit_trail(lead_id: str):
    from governance.audit_logger import AuditLogger
    return AuditLogger().get_audit_trail(lead_id)


@app.get("/dashboard/stats")
async def dashboard_stats():
    """Dashboard statistics."""
    return {
        "prospects_discovered": {"value": 1250, "delta_pct": 12.5},
        "messages_sent": {"value": 487, "delta_pct": 8.2},
        "reply_rate": {"value": 0.28, "delta_pct": 3.1},
        "meetings_booked": {"value": 42, "delta_abs": 5},
        "funnel": [
            {"label": "New", "count": 500, "pct": 40},
            {"label": "Sent", "count": 400, "pct": 32},
            {"label": "Engaged", "count": 200, "pct": 16},
            {"label": "Meeting Booked", "count": 100, "pct": 8},
        ],
        "risk_distribution": {"low": 800, "medium": 350, "high": 100},
        "blocked_patterns": [
            {"label": "Generic greetings", "count": 45},
            {"label": "Excessive links", "count": 23},
            {"label": "Compliance issues", "count": 12},
        ],
    }


@app.get("/agent-feed/recent")
async def agent_feed_recent():
    """Recent agent activity feed."""
    return [
        {
            "timestamp": "2026-05-27T10:15:00Z",
            "agent": "research",
            "message": "Researched TechCorp Inc hiring trends",
        },
        {
            "timestamp": "2026-05-27T10:12:00Z",
            "agent": "outreach",
            "message": "Generated email for Sarah Chen at Acme Corp",
        },
        {
            "timestamp": "2026-05-27T10:10:00Z",
            "agent": "gov",
            "message": "Compliance check passed for outreach batch",
        },
    ]


def _person_to_pipeline_item(person: dict) -> dict:
    """Transform Apollo normalized person into PipelineItem for the frontend."""
    return {
        "lead_id": person.get("id", ""),
        "name": person.get("name", "Unknown"),
        "title": person.get("title", ""),
        "seniority": person.get("seniority"),
        "email": person.get("email"),
        "linkedin_url": person.get("linkedin_url"),
        "company": {
            "name": person.get("company") or "Unknown",
        },
        "signals": [],
        "stage": "new",
        "reply_probability": 0.45,
    }


@app.get("/pipeline")
async def pipeline():
    """Get full pipeline of leads from Apollo."""
    try:
        people = apollo_people.search_people({
            "titles": ["VP Data", "VP Engineering", "Head of Data Engineering", "CTO", "Chief Data Officer"],
            "seniorities": ["vp", "c_suite", "director"],
            "per_page": 25,
        })
        return [_person_to_pipeline_item(p) for p in people]
    except Exception:
        return []


@app.get("/leads/list")
async def leads_list():
    """Get list of discovered leads from Apollo."""
    try:
        people = apollo_people.search_people({
            "titles": ["VP Data", "VP Engineering", "Head of Data Engineering", "CTO"],
            "seniorities": ["vp", "c_suite", "director"],
            "per_page": 25,
        })
        return people
    except Exception:
        return []


@app.get("/approval-queue")
async def approval_queue():
    """Get approval queue with citations and validator checkpoints per item."""
    leads = apollo_people.search_people({"per_page": 25})
    queue = []
    items_data = [
        {
            "body": "Hi {name}, saw {company} just closed a funding round — our pricing typically comes in around $48k annually for teams your size. Worth a 20-min scoping call?",
            "risk": "high", "trigger": "pricing_mention", "policy": "no_explicit_pricing", "conf": 0.91,
            "checkpoints": {
                "shape":          {"ok": True,  "issues": []},
                "context":        {"ok": True,  "issues": []},
                "policy":         {"ok": False, "issues": ["policy:explicit_pricing_mentioned"]},
                "hallucination":  {"ok": False, "violations": ["'$48k annually' — pricing figure not sourced from CRM or pricing sheet; appears fabricated for this lead."]},
            },
            "citations": {
                "lead_name":     {"value": "{name}", "source": "Apollo People API", "field": "lead.name"},
                "company_name":  {"value": "{company}", "source": "Apollo Company API", "field": "company.name"},
                "funding_round": {"value": "mentioned as recent", "source": "Research Agent (AI-generated)", "field": "research.signals"},
                "pricing_figure":{"value": "$48k annually", "source": "UNKNOWN — not in source data", "field": "hallucinated"},
                "team_size":     {"value": "teams your size", "source": "Apollo Company API (employee_count)", "field": "company.employee_count"},
            },
        },
        {
            "body": "Hi {name}, loved the recent product launch at {company}. We help teams like yours compress the research-to-outreach cycle significantly.",
            "risk": "medium", "trigger": "unverified_claim", "policy": "factual_accuracy_policy", "conf": 0.76,
            "checkpoints": {
                "shape":          {"ok": True,  "issues": []},
                "context":        {"ok": False, "issues": ["context:company_name_absent:{company}"]},
                "policy":         {"ok": True,  "issues": []},
                "hallucination":  {"ok": False, "violations": ["'recent product launch' — no product launch found in research data for this company."]},
            },
            "citations": {
                "lead_name":      {"value": "{name}", "source": "Apollo People API", "field": "lead.name"},
                "company_name":   {"value": "{company}", "source": "Apollo Company API", "field": "company.name"},
                "product_launch": {"value": "recent launch mentioned", "source": "UNKNOWN — not in research", "field": "hallucinated"},
                "cycle_claim":    {"value": "compress research-to-outreach cycle", "source": "LeadGenie product capability", "field": "seller_profile.capabilities"},
            },
        },
        {
            "body": "Hi {name}, noticed {company} is scaling fast. Our platform handles compliance automatically so your team can focus on pipeline.",
            "risk": "medium", "trigger": "compliance_claim", "policy": "factual_accuracy_policy", "conf": 0.82,
            "checkpoints": {
                "shape":          {"ok": True, "issues": []},
                "context":        {"ok": True, "issues": []},
                "policy":         {"ok": True, "issues": []},
                "hallucination":  {"ok": True, "violations": []},
            },
            "citations": {
                "lead_name":      {"value": "{name}", "source": "Apollo People API", "field": "lead.name"},
                "company_name":   {"value": "{company}", "source": "Apollo Company API", "field": "company.name"},
                "scaling_signal": {"value": "headcount growth > 15% 12m", "source": "Apollo Signals API", "field": "signals.headcount_growth_12m"},
                "compliance_auto":{"value": "handles compliance automatically", "source": "LeadGenie product capability", "field": "seller_profile.capabilities"},
            },
        },
        {
            "body": "Hi {name}, your work at {company} caught my attention. I'd love to show you how we're helping similar orgs close deals 2x faster.",
            "risk": "high", "trigger": "performance_guarantee", "policy": "no_guarantees_policy", "conf": 0.88,
            "checkpoints": {
                "shape":          {"ok": True,  "issues": []},
                "context":        {"ok": True,  "issues": []},
                "policy":         {"ok": False, "issues": ["policy:performance_guarantee:close_deals_2x_faster"]},
                "hallucination":  {"ok": True,  "violations": []},
            },
            "citations": {
                "lead_name":     {"value": "{name}", "source": "Apollo People API", "field": "lead.name"},
                "company_name":  {"value": "{company}", "source": "Apollo Company API", "field": "company.name"},
                "2x_faster":     {"value": "close deals 2x faster", "source": "UNVERIFIED — performance guarantee not backed by cited study", "field": "policy_violation"},
                "similar_orgs":  {"value": "similar orgs", "source": "Research Agent (industry comparison)", "field": "research.industry"},
            },
        },
    ]

    for i, lead in enumerate(leads[:4]):
        item = items_data[i % len(items_data)]
        fname = lead["name"].split()[0]
        cname = lead["company"] or "your company"
        body = item["body"].format(name=fname, company=cname)

        # Resolve citation placeholders to actual lead values
        citations = {}
        for k, v in item["citations"].items():
            resolved = dict(v)
            resolved["value"] = str(resolved.get("value") or "").replace("{name}", lead["name"]).replace("{company}", cname)
            citations[k] = resolved

        queue.append({
            "event_id": f"evt_{lead['id'][:8]}",
            "lead_id": lead["id"],
            "lead_name": lead["name"],
            "lead_title": lead["title"],
            "company_name": cname,
            "risk_level": item["risk"],
            "risk_score": round(item["conf"] - 0.1 + (i * 0.03), 2),
            "timestamp": f"2026-05-27T{10 + i}:{15 + i * 3:02d}:00Z",
            "content_snippet": body,
            "trigger": item["trigger"],
            "policy": item["policy"],
            "confidence": item["conf"],
            "checkpoints": item["checkpoints"],
            "citations": citations,
        })
    return queue


def _compute_signals(company: dict) -> list[dict]:
    signals = []
    growth_12m = company.get("headcount_growth_12m") or 0
    growth_6m = company.get("headcount_growth_6m") or 0
    techs = company.get("technologies", [])

    if growth_12m > 0.15:
        signals.append({"type": "hiring", "label": f"Rapid growth +{growth_12m*100:.0f}% 12m", "strength": "hot"})
    elif growth_12m > 0.03:
        signals.append({"type": "hiring", "label": f"Growing +{growth_12m*100:.0f}% 12m", "strength": "med"})
    elif growth_12m < -0.01:
        signals.append({"type": "hiring", "label": f"Headcount declining {growth_12m*100:.1f}% 12m", "strength": "low"})

    if growth_6m > 0.1:
        signals.append({"type": "hiring", "label": f"Accelerating +{growth_6m*100:.0f}% last 6m", "strength": "hot"})

    if "AI" in techs or "Anthropic Claude" in techs:
        signals.append({"type": "ai", "label": "AI stack detected", "strength": "hot"})

    if len(techs) >= 10:
        signals.append({"type": "tech", "label": f"{len(techs)} tech tools", "strength": "med"})

    return signals


@app.get("/company/research/{company_name}")
async def company_research(company_name: str):
    """Return deep research data for a company by name."""
    match = next(
        (c for c in _SAMPLE_COMPANIES if c["name"].lower() == company_name.lower()),
        None,
    )
    if not match:
        raise HTTPException(status_code=404, detail="Company not found")
    return {**match, "signals": _compute_signals(match)}


@app.get("/company/list")
async def company_list():
    """Return all sample companies."""
    return _SAMPLE_COMPANIES


# ── Developer Observability Endpoints ────────────────────────────────────────

@app.get("/dev/diagnostics")
async def dev_diagnostics():
    """Hallucination diagnostic summary: counts + recent events per category."""
    return diagnostic_store.get_diagnostics_summary()


@app.get("/dev/agent-metrics")
async def dev_agent_metrics():
    """Per-agent aggregated performance metrics."""
    return diagnostic_store.get_agent_metrics()


@app.get("/dev/traces")
async def dev_traces(limit: int = 50):
    """Recent agent call traces with diagnostic metadata."""
    return diagnostic_store.get_recent_traces(limit=limit)


@app.get("/dev/validation-log")
async def dev_validation_log(limit: int = 50):
    """Recent validation events with shape/context/policy outcomes."""
    return diagnostic_store.get_recent_validations(limit=limit)


@app.get("/dev/citations")
async def dev_citations(limit: int = 50):
    """Recent agent traces with source citation metadata attached."""
    return diagnostic_store.get_citations_log(limit=limit)


@app.get("/dev/retrieval-stats")
async def dev_retrieval_stats():
    """Retrieval score distribution and below-threshold counts."""
    return diagnostic_store.get_retrieval_stats()


@app.get("/dev/interpretations")
async def dev_interpretations():
    """Per-prompt-version interpretation counts and drift events."""
    from observability import interpretation_tracker
    return interpretation_tracker.get_summary()


@app.get("/dev/self-eval-stats")
async def dev_self_eval_stats():
    """Per-agent self-evaluation confidence distribution."""
    return diagnostic_store.get_self_eval_stats()


@app.get("/dev/prompt-versions")
async def dev_prompt_versions():
    """Per prompt-version stats: runs, pass rates, avg attempts, recent runs with correction history."""
    return diagnostic_store.get_prompt_version_stats()


# ── Pipeline Stats (real funnel from traces) ─────────────────────────────────

@app.get("/pipeline/stats")
async def pipeline_stats():
    """Derive real lead-generation funnel metrics directly from observability storage.

    Funnel:
      researched  → unique lead_ids with a research trace
      outreach_sent → unique lead_ids whose outreach was approved (validation allow)
      replies_received → unique lead_ids with an intent/conversation trace
      interested → lead_ids where latest intent was 'interested' or 'meeting_request'
      meetings_booked → lead_ids where latest intent was 'meeting_request'
    """
    import json as _json

    traces = diagnostic_store.get_recent_traces(limit=2000)
    validations = diagnostic_store.get_recent_validations(limit=2000)

    # leads that went through research
    researched_leads = {t["lead_id"] for t in traces if t.get("agent") == "research" and t.get("lead_id")}

    # leads whose outreach was sent (approved by governance OR successful outreach trace)
    # validation records sometimes lack lead_id; fall back to outreach traces with success=True
    approved_lead_ids = {v["lead_id"] for v in validations if v.get("agent") == "outreach" and v.get("consequence") == "allow" and v.get("lead_id")}
    if not approved_lead_ids:
        approved_lead_ids = {t["lead_id"] for t in traces if t.get("agent") == "outreach" and t.get("success") and t.get("lead_id")}

    # leads that replied (have an intent trace)
    replied_leads = {t["lead_id"] for t in traces if t.get("agent") in ("intent", "conversation") and t.get("lead_id")}

    # parse latest intent per lead from intent trace response_preview
    latest_intent: dict[str, str] = {}
    for t in sorted(traces, key=lambda x: x.get("ts", "")):
        if t.get("agent") == "intent" and t.get("lead_id"):
            preview = t.get("response_preview", "")
            # strip markdown fences
            preview = preview.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
            try:
                parsed = _json.loads(preview)
                latest_intent[t["lead_id"]] = parsed.get("intent", "")
            except Exception:
                pass

    interested_leads = {lid for lid, intent in latest_intent.items() if intent in ("interested", "meeting_request")}
    meeting_leads = {lid for lid, intent in latest_intent.items() if intent == "meeting_request"}

    # reply rate = (leads that both received outreach AND replied) / outreach sent
    replied_from_outreach = replied_leads & approved_lead_ids
    reply_rate = round(len(replied_from_outreach) / len(approved_lead_ids), 3) if approved_lead_ids else 0.0

    # governance funnel from validations
    allow_count = sum(1 for v in validations if v.get("consequence") == "allow")
    block_count = sum(1 for v in validations if v.get("consequence") == "block")
    defer_count = sum(1 for v in validations if v.get("consequence") == "defer")

    # agent call counts
    from collections import Counter as _Counter
    agent_counts = dict(_Counter(t.get("agent") for t in traces if t.get("agent")))

    return {
        "leads_researched":    len(researched_leads),
        "outreach_sent":       len(approved_lead_ids),
        "replies_received":    len(replied_from_outreach),
        "interested":          len(interested_leads),
        "meetings_booked":     len(meeting_leads),
        "reply_rate":          reply_rate,
        "total_ai_calls":      len(traces),
        "governance": {
            "approved": allow_count,
            "blocked":  block_count,
            "deferred": defer_count,
        },
        "agent_call_counts":   agent_counts,
    }


# ── Memory Governance ────────────────────────────────────────────────────────

@app.get("/memory/governance")
async def memory_governance_stats():
    """Aggregated memory governance metrics: write/retrieval/decay/protection policies + context budget."""
    return memory_governance.get_stats()


# ── Pipeline Lineage Endpoints ───────────────────────────────────────────────

@app.get("/pipeline/lineage")
async def lineage_index():
    """List all lead IDs that have audit log data, most recent first."""
    audit_dir = Path(__file__).parent / "storage" / "audit_logs"
    if not audit_dir.exists():
        return []
    results = []
    for f in sorted(audit_dir.glob("*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True):
        lead_id = f.stem
        try:
            with open(f) as fh:
                first_line = fh.readline().strip()
            if not first_line:
                continue
            ev = json.loads(first_line)
            payload = ev.get("payload", {})
            content = payload.get("content", {})
            results.append({
                "lead_id": lead_id,
                "timestamp": ev.get("timestamp", ""),
                "decision": ev.get("decision", "unknown"),
                "subject": content.get("subject", ""),
            })
        except Exception:
            continue
    return results


@app.get("/pipeline/lineage/{lead_id}")
async def pipeline_lineage(lead_id: str):
    """Full pipeline lineage for a specific lead assembled from audit + diagnostics."""
    from governance.audit_logger import AuditLogger

    audit_events = AuditLogger().get_audit_trail(lead_id)

    traces_path = Path(__file__).parent / "storage" / "diagnostics" / "traces.jsonl"
    validations_path = Path(__file__).parent / "storage" / "diagnostics" / "validations.jsonl"

    traces_by_agent: dict = {}
    if traces_path.exists():
        with open(traces_path) as f:
            for line in f:
                try:
                    t = json.loads(line.strip())
                    if t.get("lead_id") == lead_id:
                        agent = t["agent"]
                        traces_by_agent.setdefault(agent, []).append(t)
                except Exception:
                    continue

    validations_by_agent: dict = {}
    if validations_path.exists():
        with open(validations_path) as f:
            for line in f:
                try:
                    v = json.loads(line.strip())
                    if v.get("lead_id") == lead_id:
                        agent = v["agent"]
                        validations_by_agent.setdefault(agent, []).append(v)
                except Exception:
                    continue

    gov_event = audit_events[-1] if audit_events else None
    gov_payload = gov_event.get("payload", {}) if gov_event else {}
    email_content = gov_payload.get("content", {})
    tone_result = gov_payload.get("tone_result", {}) or {}
    hallucination_result = gov_payload.get("hallucination_result", {}) or {}
    risk_score = gov_payload.get("risk_score")
    final_decision = gov_event.get("decision", "unknown") if gov_event else "unknown"
    has_data = bool(audit_events)

    def latest(agent_map: dict, agent: str) -> dict:
        entries = agent_map.get(agent, [])
        return entries[-1] if entries else {}

    def all_for(agent_map: dict, agent: str) -> list:
        return agent_map.get(agent, [])

    def stage_status_from_trace(trace: dict, fallback_has_data: bool) -> str:
        if not trace:
            return "success" if fallback_has_data else "unknown"
        cats = trace.get("diagnostic_categories", [])
        if not trace.get("success", True):
            return "error"
        if cats:
            return "flagged"
        return "success"

    def build_validation(v: dict, trace: Optional[dict] = None) -> Optional[dict]:
        meta = (trace or {}).get("metadata", {}) if trace else {}
        attempt_number = meta.get("attempt_number", 1)
        attempt_history = meta.get("attempt_history") or []

        def _ah_passed(ah_item: dict) -> bool:
            """Handle both governance format (passed) and old format (consequence)."""
            if "passed" in ah_item:
                return ah_item["passed"]
            return ah_item.get("consequence", "allow") == "allow"

        # If no validation record but trace has attempt history, still build the block
        if not v:
            if not attempt_history:
                return None
            last_passed = _ah_passed(attempt_history[-1])
            return {
                "consequence": "allow" if last_passed else "defer",
                "shape_ok": True,
                "context_ok": True,
                "policy_ok": True,
                "issues": [],
                "checkpoints": {
                    "shape":   {"ok": True, "issues": []},
                    "context": {"ok": True, "issues": []},
                    "policy":  {"ok": True, "issues": []},
                },
                "attempts": len(attempt_history),
                "attempt_history": attempt_history,
            }

        result: dict = {
            "consequence": v.get("consequence", "allow"),
            "shape_ok": v.get("shape_ok"),
            "context_ok": v.get("context_ok"),
            "policy_ok": v.get("policy_ok"),
            "issues": v.get("issues", []),
            "checkpoints": {
                "shape":   {"ok": v.get("shape_ok", True),   "issues": [i for i in v.get("issues", []) if i.startswith("shape:")]},
                "context": {"ok": v.get("context_ok", True), "issues": [i for i in v.get("issues", []) if i.startswith("context:")]},
                "policy":  {"ok": v.get("policy_ok", True),  "issues": [i for i in v.get("issues", []) if i.startswith("policy:")]},
            },
            "attempts": len(attempt_history) if attempt_history else attempt_number,
            "attempt_history": attempt_history,
        }
        return result

    # ── Resolve traces & validations ──────────────────────────────────────────
    r_trace = latest(traces_by_agent, "research")
    o_traces = all_for(traces_by_agent, "outreach")
    o_trace = o_traces[-1] if o_traces else {}
    r_val = latest(validations_by_agent, "research")
    o_vals = all_for(validations_by_agent, "outreach")
    o_val = o_vals[-1] if o_vals else {}

    # ── Parse research output from trace preview ──────────────────────────────
    r_parsed: dict = {}
    r_preview = r_trace.get("response_preview", "") or ""
    if r_preview:
        try:
            r_parsed = json.loads(r_preview) if r_preview.strip().startswith("{") else {}
        except Exception:
            pass

    # ── Build lead info from audit (lead_id is available) ─────────────────────
    lead_info: dict = {}
    for ev in audit_events:
        p = ev.get("payload", {})
        if p.get("lead_name"):
            lead_info = {
                "name": p.get("lead_name"),
                "title": p.get("lead_title"),
                "company": p.get("company_name"),
                "email": p.get("lead_email"),
            }
            break

    # ── Collect citations from outreach trace ─────────────────────────────────
    o_citations = (o_trace.get("metadata", {}) or {}).get("citations") or {}
    o_retrieval_score = (o_trace.get("metadata", {}) or {}).get("retrieval_score")
    o_self_eval = (o_trace.get("metadata", {}) or {}).get("self_eval") or {}

    # ── Override tone/hallucination with final corrected state if auto-correction passed ──
    # The audit log stores the INITIAL check results (before auto-correction).
    # If the last governance attempt passed, use those layer results as the truth.
    o_attempt_history = (o_trace.get("metadata") or {}).get("attempt_history") or []
    if o_attempt_history:
        last_ah = o_attempt_history[-1]
        last_passed = last_ah.get("passed", last_ah.get("consequence") == "allow")
        if last_passed:
            last_layers = last_ah.get("layers") or {}
            if "tone" in last_layers:
                tl = last_layers["tone"]
                tone_result = {
                    "passed": tl.get("passed", True) and tl.get("consequence", "allow") != "block",
                    "issues": tl.get("issues") or [],
                }
            if "hallucination" in last_layers:
                hl = last_layers["hallucination"]
                hallucination_result = {
                    "passed": hl.get("passed", True) and not hl.get("violations"),
                    "violations": hl.get("violations") or [],
                    "confidence": hl.get("confidence"),
                    "explanation": "Corrected via auto-correction loop." if not (hl.get("violations") or []) else "",
                }

    stages = [
        {
            "id": "lead_discovery",
            "label": "Lead Discovery",
            "icon": "🔍",
            "module": "Apollo API",
            "status": "success" if has_data else "unknown",
            "parent_stage": None,
            "inputs": {
                "source": "Apollo.io People API",
                "filter_criteria": "VP / C-Suite / Director seniority",
                "lead_id": lead_id,
            },
            "outputs": {
                "lead_id": lead_id,
                "name": lead_info.get("name") or "(from pipeline)",
                "title": lead_info.get("title") or "(from pipeline)",
                "company": lead_info.get("company") or "(from pipeline)",
                "email": lead_info.get("email") or "(masked)",
            },
            "perf": {"latency_ms": None, "tokens": None, "context_score": None},
            "validation": None,
        },
        {
            "id": "research",
            "label": "Research Agent",
            "icon": "🧠",
            "module": "research_agent.py",
            "status": stage_status_from_trace(r_trace, has_data),
            "parent_stage": None,
            "inputs": {
                "company_name": lead_info.get("company") or "(from Apollo)",
                "signals": "hiring + growth signals from Apollo",
                "model": "claude-sonnet-4-6",
            },
            "outputs": {
                "summary": (r_parsed.get("summary") or (r_preview[:200] if r_preview else "(no trace)") ),
                "pain_points": r_parsed.get("pain_points") or r_parsed.get("likely_pain_points") or "(see trace)",
                "growth_stage": r_parsed.get("growth_stage") or "(see trace)",
                "ai_readiness_score": r_parsed.get("ai_readiness_score"),
                "strategic_priorities": r_parsed.get("strategic_priorities"),
            },
            "perf": {
                "latency_ms": r_trace.get("latency_ms"),
                "tokens": r_trace.get("tokens_used"),
                "context_score": (r_trace.get("metadata") or {}).get("context_score"),
            },
            "validation": build_validation(r_val),
        },
        {
            "id": "context_builder",
            "label": "Context Builder",
            "icon": "🗂️",
            "module": "context_builder.py",
            "status": "success" if has_data else "unknown",
            "parent_stage": None,
            "inputs": {
                "lead": "lead dict from Apollo",
                "company": "company dict from Apollo",
                "signals": "signals array",
                "research": "research output",
            },
            "outputs": {
                "context_keys": "lead · company · signals · research",
                "lead_name": lead_info.get("name") or "(from pipeline)",
                "company_name": lead_info.get("company") or "(from pipeline)",
                "has_research": bool(r_parsed),
                "has_signals": has_data,
            },
            "perf": {"latency_ms": None, "tokens": None, "context_score": None},
            "validation": None,
        },
        {
            "id": "trend_fetch",
            "label": "Trend Agent",
            "icon": "📈",
            "module": "trend_agent.py",
            "status": "success" if has_data else "unknown",
            "parent_stage": None,
            "inputs": {
                "sources": "RSS feeds (TechCrunch, HBR, NASSCOM)",
                "curated_list": "AI/SaaS/enterprise trend bank",
            },
            "outputs": {
                "trend_1": (o_citations.get("top_trends", [{}])[0] or {}).get("title") or "(see trace)",
                "trend_2": (o_citations.get("top_trends", [{}] * 2)[1] or {}).get("title") if len(o_citations.get("top_trends", [])) > 1 else "(see trace)",
                "trend_3": (o_citations.get("top_trends", [{}] * 3)[2] or {}).get("title") if len(o_citations.get("top_trends", [])) > 2 else "(see trace)",
            },
            "perf": {"latency_ms": None, "tokens": None, "context_score": None},
            "validation": None,
        },
        {
            "id": "relevance",
            "label": "Relevance Engine",
            "icon": "🎯",
            "module": "relevance_engine.py",
            "status": "success" if has_data else "unknown",
            "parent_stage": None,
            "inputs": {
                "context": "unified lead + company context",
                "trends_count": len(o_citations.get("top_trends", [])) or "(all fetched)",
                "top_k": 3,
                "method": "Voyage AI embeddings + cosine similarity",
            },
            "outputs": {
                "selected_trend_1": (o_citations.get("top_trends", [{}])[0] or {}).get("title") or "(see trace)",
                "source_1": (o_citations.get("top_trends", [{}])[0] or {}).get("source") or "Trend Agent",
                "url_1": (o_citations.get("top_trends", [{}])[0] or {}).get("url") or None,
            },
            "perf": {"latency_ms": None, "tokens": None, "context_score": None},
            "validation": None,
        },
        {
            "id": "outreach_gen",
            "label": "Outreach Agent",
            "icon": "✉️",
            "module": "outreach_agent.py",
            "status": stage_status_from_trace(o_trace, has_data),
            "parent_stage": None,
            "inputs": {
                "lead_name": o_citations.get("lead_name", {}).get("value") or lead_info.get("name") or lead_id,
                "company_name": o_citations.get("company_name", {}).get("value") or lead_info.get("company") or "(from context)",
                "industry": o_citations.get("industry", {}).get("value") or "(from context)",
                "top_trend": (o_citations.get("top_trends", [{}])[0] or {}).get("title") or "(see trace)",
                "pain_points": o_citations.get("pain_points", {}).get("value") or "(from research)",
            },
            "outputs": {
                "subject": email_content.get("subject") or "(see audit log)",
                "body_preview": (email_content.get("body") or "")[:300] + ("…" if len(email_content.get("body") or "") > 300 else ""),
                "reasoning": (email_content.get("reasoning") or "")[:200] + ("…" if len(email_content.get("reasoning") or "") > 200 else ""),
                "retrieval_score": round(o_retrieval_score, 3) if o_retrieval_score is not None else None,
                "self_eval_confidence": o_self_eval.get("confidence"),
                "self_eval_sufficient": o_self_eval.get("sufficient_info"),
            },
            "perf": {
                "latency_ms": o_trace.get("latency_ms"),
                "tokens": o_trace.get("tokens_used"),
                "context_score": (o_trace.get("metadata") or {}).get("context_score"),
            },
            "validation": build_validation(o_val, o_trace),
        },
        {
            "id": "tone_check",
            "label": "Tone Validator",
            "icon": "🎙️",
            "module": "tone_validator.py",
            "status": ("success" if tone_result.get("passed") else "flagged") if tone_result else ("unknown" if not has_data else "success"),
            "parent_stage": "outreach_gen",
            "inputs": {
                "email_subject": email_content.get("subject") or "(generated email)",
                "email_body_length": len(email_content.get("body") or "") or None,
            },
            "outputs": {
                "passed": tone_result.get("passed"),
                "issues": tone_result.get("issues") or [],
                "checks": "no_guarantee_language · no_excessive_links · appropriate_length · no_spam_phrases",
            },
            "perf": {"latency_ms": None, "tokens": None, "context_score": None},
            "validation": {
                "consequence": "allow" if tone_result.get("passed") else "defer",
                "shape_ok": True,
                "context_ok": tone_result.get("passed", True),
                "policy_ok": tone_result.get("passed", True),
                "issues": tone_result.get("issues") or [],
                "checkpoints": {
                    "shape":   {"ok": True, "issues": []},
                    "context": {"ok": True, "issues": []},
                    "policy":  {"ok": tone_result.get("passed", True), "issues": tone_result.get("issues") or []},
                },
            } if has_data else None,
        },
        {
            "id": "hallucination_check",
            "label": "Hallucination Check",
            "icon": "🔬",
            "module": "hallucination_checker.py",
            "status": ("success" if hallucination_result.get("passed") else "flagged") if hallucination_result else ("unknown" if not has_data else "success"),
            "parent_stage": "outreach_gen",
            "inputs": {
                "email_body": (email_content.get("body") or "")[:120] + "…" if email_content.get("body") else "(generated email)",
                "source_facts": "company_name · industry · lead_title · description · technologies",
                "fact_source": "Apollo Company API",
            },
            "outputs": {
                "passed": hallucination_result.get("passed"),
                "confidence": hallucination_result.get("confidence"),
                "violations": hallucination_result.get("violations") or [],
                "explanation": (hallucination_result.get("explanation") or "")[:200] + ("…" if len(hallucination_result.get("explanation") or "") > 200 else ""),
            },
            "perf": {"latency_ms": None, "tokens": None, "context_score": None},
            "validation": {
                "consequence": "allow" if hallucination_result.get("passed") else "defer",
                "shape_ok": True,
                "context_ok": True,
                "policy_ok": hallucination_result.get("passed", True),
                "issues": hallucination_result.get("violations") or [],
                "checkpoints": {
                    "shape":   {"ok": True, "issues": []},
                    "context": {"ok": True, "issues": []},
                    "policy":  {"ok": False, "issues": []},
                    "hallucination": {
                        "ok": hallucination_result.get("passed", True),
                        "violations": hallucination_result.get("violations") or [],
                        "confidence": hallucination_result.get("confidence"),
                        "explanation": (hallucination_result.get("explanation") or "")[:300],
                    },
                },
            } if has_data else None,
        },
        {
            "id": "risk_engine",
            "label": "Risk Engine",
            "icon": "⚖️",
            "module": "risk_engine.py",
            "status": "flagged" if final_decision == "flagged" else ("success" if final_decision == "approved" else "unknown"),
            "parent_stage": "outreach_gen",
            "inputs": {
                "tone_passed": tone_result.get("passed"),
                "hallucination_passed": hallucination_result.get("passed"),
                "violations_count": len(hallucination_result.get("violations") or []),
                "issues": gov_payload.get("issues") or [],
            },
            "outputs": {
                "risk_score": risk_score,
                "decision": final_decision,
                "rule": "risk_score < 0.4 → auto-approve | ≥ 0.4 → approval queue",
                "triggered_by": (gov_payload.get("issues") or ["none"])[0] if gov_payload.get("issues") else "all checks passed",
            },
            "perf": {"latency_ms": None, "tokens": None, "context_score": None},
            "validation": None,
        },
        {
            "id": "final",
            "label": "Email Sent" if final_decision == "approved" else "Approval Queue" if final_decision == "flagged" else "Pending",
            "icon": "🚀" if final_decision == "approved" else "🕐",
            "module": "email_sender.py" if final_decision == "approved" else "approval_queue.py",
            "status": "success" if final_decision == "approved" else ("flagged" if final_decision == "flagged" else "unknown"),
            "parent_stage": None,
            "inputs": {
                "email_subject": email_content.get("subject") or "(pending)",
                "recipient": lead_info.get("email") or "(masked)",
                "decision": final_decision,
            },
            "outputs": {
                "sent": final_decision == "approved",
                "queued_for_review": final_decision == "flagged",
                "risk_score": risk_score,
                "timestamp": gov_event.get("timestamp") if gov_event else None,
            },
            "perf": {"latency_ms": None, "tokens": None, "context_score": None},
            "validation": None,
        },
    ]

    edges = [{"source": stages[i]["id"], "target": stages[i + 1]["id"]} for i in range(len(stages) - 1)]

    return {
        "lead_id": lead_id,
        "has_data": has_data,
        "final_status": final_decision,
        "risk_score": risk_score,
        "stages": stages,
        "edges": edges,
    }


@app.post("/api/webhook/inbound-reply")
async def inbound_email_reply(request: Request):
    """Receives inbound email replies forwarded by Resend or any email routing service.

    Resend POSTs: {type, data: {from, to, subject, text, html}}
    Matches sender email → stored lead context → ConversationAgent → sends reply.
    """
    payload = await request.json()
    data = payload.get("data", {})
    sender_email = data.get("from", "").strip()
    reply_body = (data.get("text") or data.get("html") or "").strip()

    if not sender_email or not reply_body:
        return {"status": "ignored", "reason": "missing sender or body"}

    stored = lead_context_store.get_by_email(sender_email)
    if not stored:
        logger.warning("Inbound reply from unknown sender: %s", sender_email)
        return {"status": "unknown_sender", "email": sender_email}

    lead_id = stored["lead_id"]
    context = stored["context"]

    result = conversation_agent.handle_reply(
        lead_id=lead_id,
        reply=reply_body,
        context=context,
        lead_email=sender_email,
    )

    logger.info("Handled reply from %s — intent=%s", sender_email, result.get("intent"))
    return {
        "status": "processed",
        "lead_id": lead_id,
        "intent": result.get("intent"),
        "intent_confidence": result.get("intent_confidence"),
        "email_sent": result.get("email_sent", False),
        "conversation_length": result.get("conversation_length"),
    }
