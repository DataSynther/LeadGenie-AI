from pathlib import Path
from dotenv import load_dotenv
load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")

import hashlib
import asyncio
import contextlib
import json
import logging
import os
import secrets
import time
from datetime import datetime, timedelta, timezone
from fastapi import FastAPI, HTTPException, Request, Depends, Query, BackgroundTasks
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from middleware.activity_tracker import ActivityTrackerMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional

logger = logging.getLogger(__name__)

# ── Auth store ─────────────────────────────────────────────────────────────────

def _hash(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

# Role hierarchy — higher rank = more permissions
_ROLE_RANK: dict[str, int] = {"viewer": 0, "sdr": 1, "manager": 2, "admin": 3}

_USERS: dict[str, dict] = {
    "admin":   {"password": _hash("leadgenie123"), "role": "admin"},
    "manager": {"password": _hash("manager123"),   "role": "manager"},
    "sdr":     {"password": _hash("sdr123"),       "role": "sdr"},
    "demo":    {"password": _hash("demo123"),       "role": "viewer"},
}
_SESSIONS: dict[str, dict] = {}
_bearer = HTTPBearer(auto_error=False)

def _get_session(credentials: Optional[HTTPAuthorizationCredentials]) -> dict:
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    session = _SESSIONS.get(credentials.credentials)
    if not session or datetime.utcnow() > session["expires_at"]:
        _SESSIONS.pop(credentials.credentials, None)
        raise HTTPException(status_code=401, detail="Session expired or invalid")
    return session

def _require_role(min_role: str):
    """FastAPI dependency — enforces minimum role level."""
    def dep(credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer)) -> dict:
        session = _get_session(credentials)
        if _ROLE_RANK.get(session.get("role", "viewer"), 0) < _ROLE_RANK[min_role]:
            raise HTTPException(status_code=403,
                                detail=f"Requires role '{min_role}' or higher")
        return session
    return dep

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
from governance.outreach_queue_store import OutreachQueueStore
from governance.dynamo_queue_store import DynamoOutreachQueueStore
from governance.credit_store import CreditStore
from learning.feedback_collector import FeedbackCollector
from learning.learning_engine import LearningEngine
from scheduling.scheduler import Scheduler
from scheduling.followup_scheduler import FollowupScheduler
from services.lead_context_store import LeadContextStore
from services.email_sender import EmailSender
from services.twilio_whatsapp import TwilioWhatsApp
from services.whatsapp_conversation_store import WhatsAppConversationStore
from services.email_sender import EmailSender
from services.render_whatsapp_mailbox import RenderWhatsAppMailbox
from observability import diagnostic_store
from memory.memory_governance import governance as memory_governance
from memory.industry_outreach_memory import IndustryOutreachMemory
from agents.outreach.template_categorizer import TemplateCategorizer as _TemplateCategorizer, DomainDetector as _DomainDetector, STREAMS as _STREAMS, DOMAINS as _DOMAINS
from storage import stats_store, finops_store
import storage.network_store as network_store
from mcp.gateway import get_gateway, GovernanceBlockError
from mcp import audit as mcp_audit

industry_memory = IndustryOutreachMemory()

# ── Contact vault — stores original PII server-side until reveal is approved ──
# Keyed by lead_id. In production this would be an encrypted DynamoDB table.
_contact_vault: dict[str, dict] = {}


def _mask_email(email: str | None) -> str | None:
    if not email:
        return None
    parts = email.split("@")
    if len(parts) != 2:
        return "•••@•••.•••"
    user, domain = parts
    visible = user[0] if user else "•"
    return f"{visible}{'•' * min(len(user) - 1, 5)}@{domain}"


def _mask_phone(phone: str | None) -> str | None:
    if not phone or len(phone) < 4:
        return None
    return phone[:2] + "•" * max(0, len(phone) - 5) + phone[-3:]


def _mask_contact(person: dict) -> dict:
    """Return person dict with PII masked. Originals stored in _contact_vault."""
    lead_id = person.get("id") or person.get("lead_id", "")
    if lead_id:
        _contact_vault[lead_id] = {
            "email":       person.get("email"),
            "phone":       person.get("phone"),
            "linkedin_url": person.get("linkedin_url"),
        }
    masked = {**person}
    masked["email"]         = _mask_email(person.get("email"))
    masked["phone"]         = _mask_phone(person.get("phone"))
    masked["linkedin_url"]  = "linkedin.com/in/••••••" if person.get("linkedin_url") else None
    masked["_contact_masked"] = True
    return masked
_categorizer_instance = _TemplateCategorizer()
_domain_detector_instance = _DomainDetector()

# Initialise stats DB and sync existing JSONL history on startup
stats_store.init()

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
app.add_middleware(ActivityTrackerMiddleware)

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
followup_scheduler = FollowupScheduler()
lead_context_store = LeadContextStore()
whatsapp_conversation_store = WhatsAppConversationStore()
render_whatsapp_mailbox = RenderWhatsAppMailbox()
outreach_queue = DynamoOutreachQueueStore() if os.environ.get("QUEUE_TABLE") else OutreachQueueStore()
credit_store = CreditStore()
_followup_task = None


async def _followup_scheduler_loop():
    interval = int(os.getenv("FOLLOWUP_SCHEDULER_INTERVAL_SECONDS", "15"))
    logger.info("Follow-up scheduler loop started; interval=%ss", interval)
    while True:
        try:
            await asyncio.to_thread(followup_scheduler.process_due)
            await asyncio.to_thread(followup_scheduler.process_due_email_followups)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Follow-up scheduler loop failed")
        await asyncio.sleep(interval)


@app.on_event("startup")
async def start_followup_scheduler():
    global _followup_task
    enabled = os.getenv("FOLLOWUP_SCHEDULER_AUTOSTART", "true").lower() not in {"0", "false", "no"}
    if enabled and _followup_task is None:
        _followup_task = asyncio.create_task(_followup_scheduler_loop())


@app.on_event("shutdown")
async def stop_followup_scheduler():
    global _followup_task
    if _followup_task:
        _followup_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await _followup_task
        _followup_task = None


class LoginRequest(BaseModel):
    username: str
    password: str


class LeadSearchRequest(BaseModel):
    company_names: list[str] = []
    titles: list[str] = []
    seniorities: list[str] = ["director", "vp", "c_suite"]
    per_page: int = 10


class OutreachRequest(BaseModel):
    lead_id: str
    company_domain: str
    vertical_override: Optional[str] = None
    domain_override: Optional[str] = None


class OutreachSuggestRequest(BaseModel):
    lead_id: str
    company_domain: str


class ConversationRequest(BaseModel):
    lead_id: str
    reply: str
    context: dict
    lead_email: Optional[str] = None


class FeedbackRequest(BaseModel):
    lead_id: str
    outcome: str
    metadata: Optional[dict] = None


class EditEmailRequest(BaseModel):
    subject: str
    body: str


class SendOutreachRequest(BaseModel):
    lead_id: str
    to_email: Optional[str] = None
    phone: Optional[str] = None
    subject: str
    body: str
    reasoning: Optional[str] = None
    context: dict = {}
    event_id: Optional[str] = None  # pass from frontend to avoid DynamoDB GSI eventual-consistency scan


class WhatsAppReplyRequest(BaseModel):
    lead_id: str
    message: str
    conversation_id: Optional[str] = None


class QuidditchRunRequest(BaseModel):
    prompt_template: str
    model: str = "claude-sonnet-4-6"
    ground_truth: str = ""
    prompt_name: str = ""
    mock_context: Optional[dict] = None


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "version": "1.0.0"}


# ── Auth endpoints ─────────────────────────────────────────────────────────────

@app.post("/auth/login")
def auth_login(req: LoginRequest):
    username = req.username.strip().lower()
    user_rec = _USERS.get(username)
    if not user_rec or user_rec["password"] != _hash(req.password):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = secrets.token_urlsafe(32)
    role  = user_rec["role"]
    _SESSIONS[token] = {
        "username":   username,
        "role":       role,
        "expires_at": datetime.utcnow() + timedelta(hours=8),
    }
    return {"token": token, "username": username, "role": role}


@app.get("/auth/me")
def auth_me(credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer)):
    session = _get_session(credentials)
    return {"username": session["username"], "role": session["role"]}


@app.post("/auth/logout")
def auth_logout(credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer)):
    if credentials:
        _SESSIONS.pop(credentials.credentials, None)
    return {"ok": True}


@app.post("/leads/search")
async def search_leads(req: LeadSearchRequest,
                       session: dict = Depends(_require_role("viewer"))):
    try:
        results = apollo_people.search_people(req.model_dump())
        if isinstance(results, list):
            return [_mask_contact(p) for p in results]
        if isinstance(results, dict) and "people" in results:
            results["people"] = [_mask_contact(p) for p in results["people"]]
        return results
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Apollo API error: {e}")


@app.post("/contact/reveal/{lead_id}")
async def reveal_contact(lead_id: str,
                         session: dict = Depends(_require_role("sdr"))):
    """Governed contact reveal — sdr+ only. Routes through MCP Gateway.

    User identity comes from the verified session, not a spoofable header.
    Every call is logged with a Request ID regardless of decision.
    """
    user_id = session["username"]

    vault_entry = _contact_vault.get(lead_id)
    if not vault_entry:
        raise HTTPException(status_code=404,
                            detail="Contact not found. Search for this lead first.")

    try:
        result = get_gateway().call(
            "reveal_contact",
            params={"lead_id": lead_id},
            user_id=user_id,
            role=session.get("role", "viewer"),
            lead_id=lead_id,
            executor=lambda _: vault_entry,
        )
    except GovernanceBlockError as e:
        raise HTTPException(status_code=403,
                            detail={"blocked": True, "request_id": e.request_id, "reason": e.reason})

    if result.get("decision") == "DEFER":
        raise HTTPException(status_code=202,
                            detail={"deferred": True, "request_id": result["request_id"],
                                    "message": "Contact reveal queued for review"})

    return {
        "lead_id":     lead_id,
        "email":       vault_entry.get("email"),
        "phone":       vault_entry.get("phone"),
        "linkedin_url": vault_entry.get("linkedin_url"),
        "request_id":  result.get("request_id"),
        "decision":    "APPROVE",
        "governed":    True,
    }


@app.get("/governance/contact-audit")
async def contact_audit(limit: int = 100,
                        session: dict = Depends(_require_role("manager"))):
    """Return recent contact reveal audit records — manager/admin only."""
    reveals = mcp_audit.scan_reveals(limit=limit)
    total   = len(reveals)
    approved = sum(1 for r in reveals if r.get("decision") == "APPROVE")
    deferred = sum(1 for r in reveals if r.get("decision") == "DEFER")
    blocked  = sum(1 for r in reveals if r.get("decision") == "BLOCK")

    by_user: dict[str, int] = {}
    for r in reveals:
        uid = r.get("user_id", "default")
        by_user[uid] = by_user.get(uid, 0) + 1

    return {
        "total_reveals":    total,
        "approved":         approved,
        "deferred":         deferred,
        "blocked":          blocked,
        "by_user":          by_user,
        "recent_events":    reveals[:limit],
    }


@app.get("/company/enrich")
async def enrich_company(domain: str):
    company = apollo_company.enrich_company(domain)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


@app.post("/outreach/suggest")
async def suggest_outreach_context(req: OutreachSuggestRequest):
    """Detect vertical + domain for a lead before generation so the user can confirm or override."""
    lead = apollo_people.get_person_details(req.lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    company = apollo_company.enrich_company(req.company_domain)

    vertical = _categorizer_instance.categorize(lead, company or {})
    domain = _domain_detector_instance.detect(company or {})

    trends = trend_agent.get_current_trends()
    context_stub = {"lead": lead, "company": company or {}, "research": {}}
    top_trends = relevance_engine.rank_trends(context_stub, trends, top_k=3)

    return {
        "lead_name": lead.get("name", ""),
        "lead_title": lead.get("title", ""),
        "company_name": (company or {}).get("name", ""),
        "vertical": vertical,
        "domain": domain,
        "vertical_options": list(_STREAMS),
        "domain_options": list(_DOMAINS),
        "top_trends": [{"title": t.get("title"), "relevance_score": t.get("relevance_score")} for t in top_trends],
    }


@app.post("/outreach/generate")
async def generate_outreach(req: OutreachRequest):
    """Full pipeline: enrich → research → trends → relevance → outreach → governance."""
    lead = apollo_people.get_person_details(req.lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    # Live Apollo enrichment — merge extra fields onto the sample lead when available
    enriched = apollo_people.enrich_by_name(lead.get("name", ""), lead.get("company", ""))
    if enriched:
        # Prefer live data for rich fields; keep sample id/email if live truncates them
        for field in ("headline", "city", "country", "photo_url", "employment_history",
                      "org_tech_stack", "org_headcount_growth_12m", "org_revenue",
                      "org_keywords", "org_description", "org_employees", "org_industry",
                      "email_status", "departments"):
            if enriched.get(field) is not None:
                lead[field] = enriched[field]

    company = apollo_company.enrich_company(req.company_domain)
    signals = apollo_signals.detect_hiring_trends(lead.get("organization_id", ""))
    research = research_agent.research_company(company, signals)
    context = context_builder.build_lead_context(lead, company, signals, research)
    # Stash resolved vertical/domain on context so ConversationAgent can use
    # them for KB retrieval when the lead asks about Ganit's capabilities.
    from agents.outreach.template_categorizer import TemplateCategorizer, DomainDetector
    context["_vertical"] = req.vertical_override or TemplateCategorizer().categorize(lead, company)
    context["_domain"]   = req.domain_override   or DomainDetector().detect(company)

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
        vertical_override=req.vertical_override,
        domain_override=req.domain_override,
    )

    # Always enqueue for human review regardless of governance outcome
    from agents.conversation.memory_manager import GroundingMemory
    grounding_facts = GroundingMemory().read(req.lead_id)

    # Pre-generate follow-up sequence so sender can review/edit all emails before approving
    outreach_email = result["email"]
    outreach_dict  = {"subject": outreach_email.get("subject", ""), "body": outreach_email.get("body", ""),
                      "opening_hook": outreach_email.get("opening_hook", "")}
    pipeline_context = {"lead": lead, "company": company, "research": research,
                        "outreach": outreach_dict}
    try:
        followup_sequence = followup_scheduler.generate_sequence_draft(
            context=pipeline_context,
            outreach=outreach_dict,
            max_followups=4,
        )
    except Exception as _seq_err:
        logger.warning("Follow-up sequence pre-generation failed: %s", _seq_err)
        followup_sequence = []

    event_id = outreach_queue.enqueue(
        lead_id=req.lead_id,
        lead_name=lead.get("name", ""),
        lead_title=lead.get("title", ""),
        company_name=company.get("name", ""),
        lead_email=lead.get("email", ""),
        email=result["email"],
        governance=result["governance"],
        attempt_history=result["governance_attempt_history"],
        grounding_facts=grounding_facts,
        followup_sequence=followup_sequence,
    )

    # Write compact outreach example to industry memory for future few-shot learning
    email_out = result["email"]
    stream = email_out.get("stream", "generic")
    hook = email_out.get("opening_hook") or (email_out.get("body", "") or "")[:120]
    tech_tags = (company.get("technologies") or [])[:3]
    emp = company.get("employee_count") or 0
    size_bucket = (
        "1-50" if emp < 50 else
        "50-200" if emp < 200 else
        "200-1000" if emp < 1000 else
        "1000-5000" if emp < 5000 else
        "5000+"
    )
    try:
        industry_memory.write(
            stream=stream,
            lead_signals={
                "title_keywords": (lead.get("title", "") or "").lower().split()[:3],
                "company_size": size_bucket,
                "tech_tags": tech_tags,
            },
            subject=email_out.get("subject", ""),
            hook=hook,
        )
    except Exception as _mem_err:
        logger.warning("industry_memory.write failed: %s", _mem_err)

    # ── Store lead to Neo4j knowledge graph ───────────────────────────────────
    try:
        from agents.relevance.embedding_service import EmbeddingService
        import anthropic as _anthropic
        _ac = _anthropic.Anthropic()
        _profile_text = (
            f"{lead.get('name','')} {lead.get('title','')} at {company.get('name','')}. "
            f"Industry: {company.get('industry','')}. "
            f"Tech: {', '.join((company.get('technologies') or [])[:5])}. "
            f"Keywords: {', '.join((company.get('org_keywords') or [])[:5])}."
        )
        _embedding = EmbeddingService().embed_text(_profile_text)
        _tag_resp = _ac.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=200,
            messages=[{"role": "user", "content": (
                f"Extract 3-6 concise topic tags for this B2B lead profile. "
                f"Return only a JSON array of lowercase strings.\n\n{_profile_text}"
            )}],
        )
        import re as _re
        _tag_match = _re.search(r'\[.*?\]', _tag_resp.content[0].text, _re.DOTALL)
        _topics = json.loads(_tag_match.group()) if _tag_match else []
        network_store.store_lead(
            lead={**lead, "domain": company.get("primary_domain", ""), "region": lead.get("city", "")},
            embedding=_embedding,
            topics=_topics,
            engaged_via="outreach",
            employment_history=lead.get("employment_history") or [],
        )
    except Exception as _net_err:
        logger.warning("network_store.store_lead failed: %s", _net_err)

    # ── Record to stats store for Mission Control dashboard ───────────────────
    try:
        gov = result["governance"]
        attempt_hist = result["governance_attempt_history"]
        last = attempt_hist[-1] if attempt_hist else {}
        layers = last.get("layers", {})
        tone_layer = layers.get("tone", {})
        halluc_layer = layers.get("hallucination", {})
        stats_store.record_outreach(
            event_id=event_id,
            lead_id=req.lead_id,
            lead_name=lead.get("name", ""),
            company_name=company.get("name", ""),
            risk_score=gov.get("risk_score", 0.0),
            risk_level=gov.get("risk_level", "low"),
            status="pending",
            tone_passed=not tone_layer.get("issues"),
            hallucination_passed=halluc_layer.get("passed", True),
            tone_issues=tone_layer.get("issues", []),
            hallucination_violations=halluc_layer.get("violations", []),
            total_attempts=gov.get("total_attempts", 1),
        )
        stats_store.record_agent_event(
            agent="outreach",
            message=f"Generated outreach for {lead.get('name', '')} at {company.get('name', '')}",
            lead_id=req.lead_id,
        )
    except Exception as _stats_err:
        logger.warning("stats_store.record_outreach failed: %s", _stats_err)

    return {
        "lead": lead,
        "company": company,
        "top_trends": top_trends,
        "email": result["email"],
        "governance": result["governance"],
        "governance_attempt_history": result["governance_attempt_history"],
        "queued_event_id": event_id,
    }


@app.post("/outreach/generate/stream")
async def generate_outreach_stream(req: OutreachRequest):
    """SSE endpoint — streams pipeline stage events then the full result."""

    async def event_stream():
        def sse(stage: str, label: str, status: str = "running", result: dict | None = None) -> str:
            payload: dict = {"stage": stage, "label": label, "status": status}
            if result is not None:
                payload["result"] = result
            return f"data: {json.dumps(payload)}\n\n"

        _run_start = time.monotonic()
        _stage_timings: list[dict] = []

        def _tick(stage: str, t0: float) -> None:
            _stage_timings.append({"stage": stage, "duration_ms": int((time.monotonic() - t0) * 1000)})

        try:
            # ── Stage 1: Lead enrichment ──────────────────────────────────────
            yield sse("enriching_lead", "Fetching lead data")
            _t = time.monotonic()
            lead = await asyncio.to_thread(apollo_people.get_person_details, req.lead_id)
            if not lead:
                yield sse("enriching_lead", "Lead not found", "error")
                return
            enriched = await asyncio.to_thread(
                apollo_people.enrich_by_name, lead.get("name", ""), lead.get("company", "")
            )
            if enriched:
                for field in ("headline", "city", "country", "photo_url", "employment_history",
                              "org_tech_stack", "org_headcount_growth_12m", "org_revenue",
                              "org_keywords", "org_description", "org_employees", "org_industry",
                              "email_status", "departments"):
                    if enriched.get(field) is not None:
                        lead[field] = enriched[field]
            _tick("enriching_lead", _t)
            yield sse("enriching_lead", "Lead data ready", "done")

            # ── Stage 2: Company enrichment ───────────────────────────────────
            yield sse("enriching_company", "Enriching company profile")
            _t = time.monotonic()
            company = await asyncio.to_thread(apollo_company.enrich_company, req.company_domain)
            _tick("enriching_company", _t)
            yield sse("enriching_company", "Company profile ready", "done")

            # ── Stage 3: Hiring signals ───────────────────────────────────────
            yield sse("detecting_signals", "Detecting hiring & growth signals")
            _t = time.monotonic()
            signals = await asyncio.to_thread(
                apollo_signals.detect_hiring_trends, lead.get("organization_id", "")
            )
            _tick("detecting_signals", _t)
            yield sse("detecting_signals", "Signals detected", "done")

            # ── Stage 4: AI research ──────────────────────────────────────────
            yield sse("researching", "AI company research")
            _t = time.monotonic()
            research = await asyncio.to_thread(research_agent.research_company, company, signals)
            _tick("researching", _t)
            yield sse("researching", "Research complete", "done")

            # ── Stage 5: Context builder ──────────────────────────────────────
            yield sse("building_context", "Building lead context")
            _t = time.monotonic()
            context = await asyncio.to_thread(
                context_builder.build_lead_context, lead, company, signals, research
            )
            from agents.outreach.template_categorizer import TemplateCategorizer, DomainDetector
            context["_vertical"] = req.vertical_override or TemplateCategorizer().categorize(lead, company)
            context["_domain"]   = req.domain_override   or DomainDetector().detect(company)
            _tick("building_context", _t)
            yield sse("building_context", "Context ready", "done")

            # ── Stage 6: Market trends ────────────────────────────────────────
            yield sse("fetching_trends", "Fetching market trends")
            _t = time.monotonic()
            trends = await asyncio.to_thread(trend_agent.get_current_trends)
            _tick("fetching_trends", _t)
            yield sse("fetching_trends", f"{len(trends)} trends loaded", "done")

            # ── Stage 7: Relevance ranking ────────────────────────────────────
            yield sse("ranking_relevance", "Ranking trends by relevance")
            _t = time.monotonic()
            top_trends = await asyncio.to_thread(
                relevance_engine.rank_trends, context, trends, 3
            )
            _tick("ranking_relevance", _t)
            yield sse("ranking_relevance", "Top 3 trends selected", "done")

            # ── Stage 8: Email generation + governance ────────────────────────
            yield sse("generating_email", "Generating personalised email (Claude)")
            source_facts = {
                "company_name": company.get("name"),
                "industry": company.get("industry"),
                "lead_title": lead.get("title"),
                "description": company.get("description"),
                "employee_count": company.get("employee_count"),
                "technologies": company.get("technologies", []),
            }
            _t = time.monotonic()
            result = await asyncio.to_thread(
                governance_orchestrator.run,
                outreach_agent,
                context,
                top_trends,
                source_facts,
                req.lead_id,
                req.vertical_override,
                req.domain_override,
            )
            _tick("generating_email", _t)
            yield sse("generating_email", "Email generated", "done")

            # ── Stage 9: Governance result ────────────────────────────────────
            gov = result["governance"]
            risk = gov.get("risk_score", 0.0)
            risk_label = gov.get("risk_level", "low")
            gov_label = f"Risk {risk_label} ({risk:.2f}) — {'auto-approved' if gov.get('approved') else 'queued for review'}"
            yield sse("governance", gov_label, "done")

            # ── Stage 10: Queue ────────────────────────────────────────────────
            yield sse("queueing", "Adding to approval queue")
            _t = time.monotonic()
            from agents.conversation.memory_manager import GroundingMemory
            grounding_facts = GroundingMemory().read(req.lead_id)
            _test_phone = os.getenv("WHATSAPP_TEST_PHONE", "")
            _lead_phone = _test_phone or lead.get("phone") or ""

            # Pre-generate follow-up sequence for human review in the queue
            _outreach_email = result["email"]
            _outreach_dict = {"subject": _outreach_email.get("subject", ""),
                              "body": _outreach_email.get("body", ""),
                              "opening_hook": _outreach_email.get("opening_hook", "")}
            _pipeline_ctx = {"lead": lead, "company": company, "research": research,
                             "outreach": _outreach_dict}
            try:
                _followup_sequence = followup_scheduler.generate_sequence_draft(
                    context=_pipeline_ctx,
                    outreach=_outreach_dict,
                    max_followups=4,
                )
            except Exception as _seq_err:
                logger.warning("Follow-up sequence pre-generation failed: %s", _seq_err)
                _followup_sequence = []

            event_id = outreach_queue.enqueue(
                lead_id=req.lead_id,
                lead_name=lead.get("name", ""),
                lead_title=lead.get("title", ""),
                company_name=company.get("name", ""),
                lead_email=lead.get("email", ""),
                lead_phone=_lead_phone,
                email=result["email"],
                governance=result["governance"],
                attempt_history=result["governance_attempt_history"],
                grounding_facts=grounding_facts,
                followup_sequence=_followup_sequence,
            )

            # Background bookkeeping (non-blocking, best-effort)
            try:
                email_out = result["email"]
                stream_name = email_out.get("stream", "generic")
                hook = email_out.get("opening_hook") or (email_out.get("body", "") or "")[:120]
                tech_tags = (company.get("technologies") or [])[:3]
                emp = company.get("employee_count") or 0
                size_bucket = (
                    "1-50" if emp < 50 else "50-200" if emp < 200 else
                    "200-1000" if emp < 1000 else "1000-5000" if emp < 5000 else "5000+"
                )
                industry_memory.write(
                    stream=stream_name,
                    lead_signals={
                        "title_keywords": (lead.get("title", "") or "").lower().split()[:3],
                        "company_size": size_bucket,
                        "tech_tags": tech_tags,
                    },
                    subject=email_out.get("subject", ""),
                    hook=hook,
                )
                attempt_hist = result["governance_attempt_history"]
                last = attempt_hist[-1] if attempt_hist else {}
                layers = last.get("layers", {})
                tone_layer = layers.get("tone", {})
                halluc_layer = layers.get("hallucination", {})
                stats_store.record_outreach(
                    event_id=event_id,
                    lead_id=req.lead_id,
                    lead_name=lead.get("name", ""),
                    company_name=company.get("name", ""),
                    risk_score=gov.get("risk_score", 0.0),
                    risk_level=gov.get("risk_level", "low"),
                    status="pending",
                    tone_passed=not tone_layer.get("issues"),
                    hallucination_passed=halluc_layer.get("passed", True),
                    tone_issues=tone_layer.get("issues", []),
                    hallucination_violations=halluc_layer.get("violations", []),
                    total_attempts=gov.get("total_attempts", 1),
                )
                stats_store.record_agent_event(
                    agent="outreach",
                    message=f"Generated outreach for {lead.get('name', '')} at {company.get('name', '')}",
                    lead_id=req.lead_id,
                )
            except Exception as _err:
                logger.warning("post-generate bookkeeping failed: %s", _err)

            _tick("queueing", _t)
            yield sse("queueing", "Queued for review", "done")

            # ── Record per-stage timings ──────────────────────────────────────
            try:
                stats_store.write_pipeline_run(
                    ts=datetime.now(timezone.utc).isoformat(),
                    lead_id=req.lead_id,
                    lead_name=lead.get("name", ""),
                    company_name=company.get("name", ""),
                    stage_timings=_stage_timings,
                    total_ms=int((time.monotonic() - _run_start) * 1000),
                )
            except Exception as _err:
                logger.warning("write_pipeline_run failed: %s", _err)

            # ── Final: send full result ───────────────────────────────────────
            yield sse("done", "Pipeline complete", "done", result={
                "lead": lead,
                "company": company,
                "top_trends": top_trends,
                "email": result["email"],
                "governance": result["governance"],
                "governance_attempt_history": result["governance_attempt_history"],
                "queued_event_id": event_id,
            })

        except Exception as exc:
            logger.exception("generate/stream pipeline error")
            yield sse("error", str(exc), "error")

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/outreach/send")
async def send_outreach(req: SendOutreachRequest):
    """Send a reviewed outreach email and schedule WhatsApp follow-up if phone is available."""
    lead = apollo_people.get_person_details(req.lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if not req.to_email:
        raise HTTPException(status_code=400, detail="Lead email is required")

    result = EmailSender().send(to_email=req.to_email, subject=req.subject, body=req.body)
    if not result.get("sent"):
        raise HTTPException(status_code=502, detail=result.get("error"))

    req_lead = req.context.get("lead", {}) if isinstance(req.context, dict) else {}
    req_company = req.context.get("company", {}) if isinstance(req.context, dict) else {}
    lead_phone = req.phone or lead.get("phone") or req_lead.get("phone") or req_company.get("phone")
    enriched_context = {
        **req.context,
        "lead": {**req.context.get("lead", {}), "email": req.to_email, "phone": lead_phone},
        "outreach": {"subject": req.subject, "body": req.body, "reasoning": req.reasoning},
    }
    lead_context_store.save(req.to_email, req.lead_id, enriched_context)

    # Mark the queue item as approved. Use event_id directly if provided (avoids DynamoDB
    # GSI eventual-consistency issue where a just-inserted item may not appear in a scan).
    if req.event_id:
        outreach_queue.update_status(req.event_id, "approved")
        try:
            stats_store.update_outreach_status(req.event_id, "approved")
        except Exception as _e:
            logger.warning("stats_store.update_outreach_status failed: %s", _e)
    else:
        pending = outreach_queue.get_queue(status="pending")
        for item in pending:
            if item.get("lead_id") == req.lead_id:
                outreach_queue.update_status(item["event_id"], "approved")
                try:
                    stats_store.update_outreach_status(item["event_id"], "approved")
                except Exception as _e:
                    logger.warning("stats_store.update_outreach_status failed: %s", _e)
                break

    followup = None
    if lead_phone:
        followup = followup_scheduler.schedule_followup(
            lead_id=req.lead_id,
            phone=lead_phone,
            context=enriched_context,
            outreach={"subject": req.subject, "body": req.body, "reasoning": req.reasoning},
        )

    return {"sent": True, "to": req.to_email, "lead_id": req.lead_id, "followup": followup}


@app.post("/conversation/reply")
async def handle_reply(req: ConversationRequest):
    # Mark as replied immediately so the WhatsApp scheduler skips this lead
    followup_scheduler.mark_replied(req.lead_id)
    # Resolve lead email: explicit field > context.lead.email (so reply is sent via email not just logged)
    lead_email = req.lead_email or (req.context.get("lead") or {}).get("email")
    result = await asyncio.to_thread(
        conversation_agent.handle_reply, req.lead_id, req.reply, req.context, lead_email
    )
    try:
        stats_store.record_conversation(
            lead_id=req.lead_id,
            intent=result.get("intent", "neutral"),
            confidence=result.get("intent_confidence"),
        )
        stats_store.record_agent_event(
            agent="conversation",
            message=f"Replied to {req.lead_id} (intent: {result.get('intent', 'neutral')})",
            lead_id=req.lead_id,
        )
    except Exception as _stats_err:
        logger.warning("stats_store.record_conversation failed: %s", _stats_err)
    # Always surface the generated reply text so the frontend can display it immediately,
    # regardless of whether the email send succeeded
    if "reply" not in result and result.get("email"):
        result["reply"] = result["email"].get("body") or result["email"].get("content", "")
    return result


@app.post("/feedback/record")
async def record_feedback(req: FeedbackRequest):
    feedback_collector.record_outcome(req.lead_id, req.outcome, req.metadata)
    try:
        if req.outcome == "meeting_booked":
            stats_store.record_conversation(
                lead_id=req.lead_id,
                intent="meeting_request",
            )
        stats_store.record_agent_event(
            agent="gov",
            message=f"Outcome recorded: {req.outcome} for {req.lead_id}",
            lead_id=req.lead_id,
        )
    except Exception as _stats_err:
        logger.warning("stats_store.record_feedback failed: %s", _stats_err)
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
    """Dashboard statistics derived from real event data."""
    return stats_store.get_dashboard_stats()


@app.get("/dashboard/outreach-trend")
async def outreach_trend(days: int = 30):
    """Daily outreach volume for the past N days (continuous, zero-filled)."""
    return stats_store.get_outreach_trend(days)


@app.get("/dashboard/pipeline-latency")
async def pipeline_latency(n: int = 30):
    """Per-stage latency for the last N pipeline runs."""
    return stats_store.get_pipeline_runs(n)


@app.get("/dashboard/extended-stats")
async def dashboard_extended_stats():
    """Extended Mission Control stats: company breakdown, validation, governance, intent."""
    return stats_store.get_extended_stats()


@app.get("/dashboard/kb-insights")
async def dashboard_kb_insights():
    """KB retrieval insights: claim catalogue, top pain-points, industry memory."""
    return stats_store.get_kb_insights()


@app.get("/dashboard/stats/raw")
async def dashboard_stats_raw():
    """Raw table rows for validating dashboard numbers."""
    return {
        "outreach_events":      stats_store.get_raw_outreach(limit=200),
        "conversation_events":  stats_store.get_raw_conversations(limit=200),
        "agent_events":         stats_store.get_raw_agent_events(limit=200),
    }


@app.get("/agent-feed/recent")
async def agent_feed_recent():
    """Recent agent activity from the stats store."""
    events = stats_store.get_recent_agent_events(limit=20)
    # Normalise agent label to known frontend keys
    _agent_map = {"research": "research", "outreach": "outreach",
                  "conversation": "reply", "intent": "gov", "gov": "gov",
                  "governance": "gov", "schedule": "schedule"}
    for e in events:
        e["agent"] = _agent_map.get(e["agent"], "gov")
    return events


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
    """Return all emails pending human review (sorted by risk desc)."""
    return outreach_queue.get_queue(status="pending")


@app.get("/approval-queue/sent")
async def sent_emails():
    """Return approved/sent outreach emails sorted by recency."""
    return outreach_queue.get_queue(status="approved")


class SequenceUpdateRequest(BaseModel):
    followup_sequence: list[dict]

@app.put("/approval-queue/{event_id}/sequence")
async def update_followup_sequence(event_id: str, req: SequenceUpdateRequest):
    """Save sender's edits to the follow-up sequence (subject, body, delay_days)."""
    found = outreach_queue.update_followup_sequence(event_id, req.followup_sequence)
    if not found:
        raise HTTPException(status_code=404, detail="Event not found")
    return {"updated": True, "event_id": event_id, "count": len(req.followup_sequence)}


class ApproveWithSequenceRequest(BaseModel):
    followup_sequence: Optional[list[dict]] = None

@app.post("/approval-queue/{event_id}/approve")
async def approve_outreach(event_id: str, req: ApproveWithSequenceRequest = ApproveWithSequenceRequest()):
    """Approve and immediately send the outreach email, then schedule the follow-up sequence."""
    item = outreach_queue.get_item(event_id)
    if not item:
        raise HTTPException(status_code=404, detail="Event not found")

    email = item.get("email") or {}
    to_email = item.get("lead_email") or email.get("to")
    subject  = email.get("subject", "")
    body     = email.get("body", "")

    if not to_email:
        raise HTTPException(status_code=400, detail="No recipient email on queued item")

    send_result = EmailSender().send(to_email=to_email, subject=subject, body=body)
    if not send_result.get("sent"):
        raise HTTPException(status_code=502, detail=f"Email send failed: {send_result.get('error')}")

    outreach_queue.update_status(event_id, "approved")
    stats_store.update_outreach_status(event_id, "approved")
    stats_store.record_agent_event(agent="gov", message=f"Outreach approved & sent to {to_email}", lead_id=item.get("lead_id", ""))

    # Use sequence from request body (sender's edits) or fall back to stored draft
    approved_sequence = req.followup_sequence or item.get("followup_sequence") or []

    # Schedule WhatsApp follow-up + email sequence
    test_phone = os.getenv("WHATSAPP_TEST_PHONE", "")
    lead_phone = test_phone or item.get("lead_phone", "")
    context = {
        "lead":    {"email": to_email, "phone": lead_phone, "name": item.get("lead_name", "")},
        "company": {"name": item.get("company_name", "")},
        "outreach": {"subject": subject, "body": body},
    }
    lead_context_store.save(to_email, item.get("lead_id", ""), context)
    followup_scheduler.schedule_followup(
        lead_id=item.get("lead_id", ""),
        phone=lead_phone,
        context=context,
        outreach={"subject": subject, "body": body},
        followup_sequence=approved_sequence,
    )

    return {
        "status": "approved", "sent": True, "to": to_email, "event_id": event_id,
        "followups_scheduled": len(approved_sequence),
    }


@app.post("/approval-queue/{event_id}/reject")
async def reject_outreach(event_id: str):
    """Mark an outreach email as rejected."""
    found = outreach_queue.update_status(event_id, "rejected")
    if not found:
        raise HTTPException(status_code=404, detail="Event not found")
    stats_store.update_outreach_status(event_id, "rejected")
    stats_store.record_agent_event(agent="gov", message=f"Outreach rejected: {event_id}")
    return {"status": "rejected", "event_id": event_id}


@app.post("/approval-queue/{event_id}/edit-email")
async def edit_email(event_id: str, req: EditEmailRequest):
    """Human manually edits the email subject + body before approving."""
    found = outreach_queue.update_email(event_id, req.subject, req.body)
    if not found:
        raise HTTPException(status_code=404, detail="Event not found")
    return {"status": "updated", "event_id": event_id}


@app.post("/approval-queue/{event_id}/recheck-hallucination")
async def recheck_hallucination(event_id: str):
    """Re-run hallucination check on the current email body. Costs 1 credit."""
    # Find the item
    items = outreach_queue.get_queue()
    item = next((i for i in items if i.get("event_id") == event_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Event not found")

    # Deduct credit before calling Claude
    try:
        credits = credit_store.deduct(1)
    except ValueError as exc:
        raise HTTPException(status_code=402, detail=str(exc))

    # Run hallucination check against grounding facts for this lead
    from agents.conversation.memory_manager import GroundingMemory
    lead_id = item.get("lead_id", "")
    grounding_facts = GroundingMemory().read(lead_id) if lead_id else {}
    email_body = (item.get("email") or {}).get("body", "")
    hallucination = risk_engine.hallucination_checker.check(
        email_body, {}, lead_id=lead_id
    )

    # Persist updated hallucination result in queue
    outreach_queue.update_hallucination(event_id, hallucination)

    return {
        "event_id":          event_id,
        "hallucination":     hallucination,
        "credits_remaining": credits["remaining"],
    }


@app.get("/credits")
async def get_credits():
    """Return hallucination re-check credit balance."""
    return credit_store.get_credits()


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

@app.get("/dev/finops")
async def dev_finops():
    """AI FinOps report: cost per agent, model routing, per-lead costs, outcome unit economics."""
    return finops_store.get_finops_summary()


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


@app.get("/dev/engagement-runs")
async def dev_engagement_runs():
    """Per-engagement governance runs (one per lead outreach/reply) with full per-attempt detail."""
    gov_runs = diagnostic_store.get_governance_runs(limit=100)
    runs = []
    for r in sorted(gov_runs, key=lambda x: x.get("ts", ""), reverse=True):
        lead_id = r.get("lead_id")
        runs.append({
            "run_id": f"{r.get('ts', '')}_{lead_id or 'unknown'}",
            "ts": r.get("ts", ""),
            "lead_id": lead_id,
            "lead_name": r.get("lead_name"),
            "company_name": r.get("company_name"),
            "agent": r.get("agent", "outreach"),
            "prompt_version": r.get("prompt_version", ""),
            "total_attempts": r.get("total_attempts", 1),
            "final_passed": r.get("final_passed", True),
            "final_risk_score": r.get("final_risk_score"),
            "attempts": r.get("attempts", []),
        })
    return runs


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
    from governance.audit_logger import AuditLogger
    items = AuditLogger().get_all_lead_ids()
    results = []
    for item in items:
        results.append({
            "lead_id":   item.get("lead_id", ""),
            "timestamp": item.get("timestamp", ""),
            "decision":  item.get("decision", "unknown"),
            "subject":   "",
        })
    return results


@app.get("/pipeline/lineage/{lead_id}")
async def pipeline_lineage(lead_id: str):
    """Full pipeline lineage for a specific lead assembled from audit + diagnostics."""
    from governance.audit_logger import AuditLogger
    from observability.diagnostic_store import get_traces_for_lead, get_validations_for_lead

    audit_events = AuditLogger().get_audit_trail(lead_id)
    traces_by_agent = get_traces_for_lead(lead_id)
    validations_by_agent = get_validations_for_lead(lead_id)

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
    followup_scheduler.mark_replied(lead_id)

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


# ── WhatsApp Endpoints ────────────────────────────────────────────────────────

@app.post("/whatsapp")
@app.post("/api/webhook/whatsapp-reply")
async def inbound_whatsapp_reply(request: Request):
    """Receive inbound WhatsApp replies from Twilio and queue for human review."""
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        payload = await request.json()
    else:
        payload = await request.form()

    sender_phone = (payload.get("From") or payload.get("from") or payload.get("phone") or payload.get("sender") or "").strip()
    reply_body = (payload.get("Body") or payload.get("body") or payload.get("message") or "").strip()

    if not sender_phone or reply_body == "":
        return {"stored": False, "reason": "missing sender or body"}

    mailbox_message = render_whatsapp_mailbox.store_inbound(sender_phone, reply_body)
    import_result = render_whatsapp_mailbox.import_messages([mailbox_message])
    return {
        "stored": import_result.get("imported", 0) > 0,
        "message": mailbox_message,
        "import": import_result,
        "unread_count": whatsapp_conversation_store.unread_count(),
    }


@app.get("/whatsapp/conversations")
async def whatsapp_conversations():
    """List active WhatsApp conversations."""
    sync_result = render_whatsapp_mailbox.import_remote_pending()
    conversations = whatsapp_conversation_store.list_active()
    return {
        "unread_count": whatsapp_conversation_store.unread_count(),
        "conversations": conversations,
        "sync": sync_result,
    }


@app.get("/whatsapp/conversations/{conversation_id}")
async def whatsapp_conversation(conversation_id: str):
    record = whatsapp_conversation_store.get(conversation_id)
    if not record:
        raise HTTPException(status_code=404, detail="WhatsApp conversation not found")
    return {"conversation": whatsapp_conversation_store._summary(record)}


@app.post("/whatsapp/conversations/{conversation_id}/open")
async def open_whatsapp_conversation(conversation_id: str):
    record = whatsapp_conversation_store.mark_opened(conversation_id)
    if not record:
        raise HTTPException(status_code=404, detail="WhatsApp conversation not found")
    return {
        "unread_count": whatsapp_conversation_store.unread_count(),
        "conversation": whatsapp_conversation_store._summary(record),
    }


@app.delete("/whatsapp/conversations/{conversation_id}")
async def delete_whatsapp_conversation(conversation_id: str):
    deleted = whatsapp_conversation_store.delete(conversation_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="WhatsApp conversation not found")
    return {"deleted": True, "conversation_id": conversation_id, "unread_count": whatsapp_conversation_store.unread_count()}


@app.post("/whatsapp/reply")
async def send_whatsapp_reply(req: WhatsAppReplyRequest):
    """Send a human-authored WhatsApp reply."""
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message is required")

    conversation_id = req.conversation_id or req.lead_id
    record = whatsapp_conversation_store.get(conversation_id)
    lead_id = (record or {}).get("lead_id") or req.lead_id

    if not record:
        followup = followup_scheduler.get(lead_id)
        if followup:
            record = {"phone": followup.get("phone"), "context": followup.get("context", {})}

    phone = (record or {}).get("phone")
    if not phone:
        raise HTTPException(status_code=404, detail="WhatsApp phone number not found")

    result = TwilioWhatsApp().send(phone=phone, message=req.message)
    if not result.get("sent"):
        raise HTTPException(status_code=502, detail=result.get("error"))

    context = (record or {}).get("context", {})
    updated = whatsapp_conversation_store.add_message(
        lead_id=lead_id, context=context, direction="outbound", message=req.message, phone=phone,
    )
    return {
        "sent": True,
        "lead_id": lead_id,
        "to": result.get("to") or phone,
        "conversation": whatsapp_conversation_store._summary(updated),
    }


@app.get("/whatsapp/debug")
async def whatsapp_debug():
    return render_whatsapp_mailbox.debug_status()


@app.get("/pending-messages")
async def pending_messages():
    messages = render_whatsapp_mailbox.local_pending()
    return {"messages": messages, "count": len(messages)}


@app.post("/followups/process-due")
async def process_due_followups():
    return {"processed": followup_scheduler.process_due()}


# ── Quidditch — Prompt × Model Performance Lab ────────────────────────────────

@app.post("/quidditch/run")
async def quidditch_run(req: QuidditchRunRequest):
    from quidditch.runner import run_match
    result = await asyncio.to_thread(
        run_match,
        req.prompt_template,
        req.model,
        req.ground_truth,
        req.prompt_name,
        req.mock_context,
    )
    return result


@app.get("/quidditch/history")
async def quidditch_history():
    from quidditch.runner import get_history
    return get_history()


@app.patch("/quidditch/runs/{run_id}/human-scores")
async def quidditch_human_scores(run_id: str, scores: dict):
    from quidditch.runner import patch_human_scores
    ok = patch_human_scores(run_id, scores)
    if not ok:
        raise HTTPException(status_code=404, detail="Run not found")
    return {"ok": True}


# ── Lead Network (Neo4j Knowledge Graph) ──────────────────────────────────────

class NetworkQueryRequest(BaseModel):
    query: str
    top_k: int = 10

class NetworkStoreRequest(BaseModel):
    lead: dict
    topics: list[str] = []
    engaged_via: str = "manual"

class TagRequest(BaseModel):
    tags: list[str]


@app.on_event("startup")
async def _init_neo4j_schema():
    try:
        await asyncio.to_thread(network_store.init_schema)
        logger.info("Neo4j schema ready")
    except Exception as e:
        logger.warning("Neo4j schema init failed (will retry on first use): %s", e)


@app.post("/network/query")
async def network_query(
    req: NetworkQueryRequest,
    session: dict = Depends(_require_role("viewer")),
):
    """Natural language query over the lead knowledge graph."""
    import anthropic as _ac
    from agents.relevance.embedding_service import EmbeddingService

    client = _ac.Anthropic()

    # Step 1: Claude extracts structured intent
    intent_resp = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=400,
        messages=[{"role": "user", "content": (
            f"Extract search intent from this lead network query as JSON with keys: "
            f"topics (list of lowercase strings), region (string or null), "
            f"industry (string or null), semantic_query (rephrased for embedding search), "
            f"past_org (company name if query asks about past employers, e.g. 'worked at Google', else null).\n\n"
            f"Query: {req.query}"
        )}],
    )
    import re
    intent_text = intent_resp.content[0].text
    match = re.search(r'\{.*\}', intent_text, re.DOTALL)
    intent = json.loads(match.group()) if match else {}

    topics   = intent.get("topics", [])
    region   = intent.get("region")
    past_org = intent.get("past_org")
    sem_q    = intent.get("semantic_query", req.query)

    # Step 2: Graph traversal — past org takes priority if detected
    graph_results = []
    if past_org:
        graph_results = await asyncio.to_thread(
            network_store.find_by_past_org, past_org, req.top_k
        )
    elif topics:
        graph_results = await asyncio.to_thread(
            network_store.query_by_topics, topics, region, req.top_k
        )

    # Step 3: Semantic vector search
    query_embedding = await asyncio.to_thread(
        EmbeddingService().embed_text, sem_q
    )
    semantic_results = await asyncio.to_thread(
        network_store.semantic_search, query_embedding, req.top_k
    )

    # Step 4: Merge + deduplicate, graph results ranked first
    seen: set[str] = set()
    merged = []
    for r in graph_results:
        lid = r.get("lead_id")
        if lid and lid not in seen:
            seen.add(lid)
            merged.append({**r, "match_type": "graph"})
    for r in semantic_results:
        lid = r.get("lead_id")
        if lid and lid not in seen:
            seen.add(lid)
            merged.append({**r, "match_type": "semantic", "score": r.get("score", 0)})

    return {
        "query": req.query,
        "intent": intent,
        "results": merged[:req.top_k],
        "total": len(merged),
    }


@app.get("/network/past-org")
async def network_past_org(
    org: str,
    session: dict = Depends(_require_role("viewer")),
):
    """Find leads who previously worked at a given organisation."""
    results = await asyncio.to_thread(network_store.find_by_past_org, org)
    return {"org": org, "results": results, "total": len(results)}


@app.get("/network/leads")
async def network_leads(
    region: Optional[str] = Query(None),
    industry: Optional[str] = Query(None),
    topic: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    session: dict = Depends(_require_role("viewer")),
):
    """List stored leads with optional filters."""
    leads = await asyncio.to_thread(
        network_store.list_leads, region, industry, topic, limit
    )
    return {"leads": leads, "total": len(leads)}


@app.get("/network/graph")
async def network_graph(
    limit: int = Query(30, le=100),
    session: dict = Depends(_require_role("viewer")),
):
    """Return nodes + edges for force-directed graph visualisation."""
    data = await asyncio.to_thread(network_store.get_graph_data, limit)
    return data


@app.get("/network/leads/{lead_id}")
async def network_get_lead(
    lead_id: str,
    session: dict = Depends(_require_role("viewer")),
):
    lead = await asyncio.to_thread(network_store.get_lead, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found in network")
    return lead


@app.post("/network/leads/{lead_id}/tags")
async def network_tag_lead(
    lead_id: str,
    req: TagRequest,
    session: dict = Depends(_require_role("sdr")),
):
    """Manually add topic tags to a lead node."""
    gateway = get_gateway()
    result = gateway.call(
        "tag_lead",
        {"lead_id": lead_id, "tags": req.tags},
        user_id=session["username"],
        role=session.get("role", "viewer"),
        executor=lambda p: network_store.add_tags(p["lead_id"], p["tags"]),
    )
    return result


@app.post("/network/store")
async def network_store_lead(
    req: NetworkStoreRequest,
    session: dict = Depends(_require_role("sdr")),
):
    """Manually store a lead to the knowledge graph."""
    from agents.relevance.embedding_service import EmbeddingService
    profile_text = (
        f"{req.lead.get('name','')} {req.lead.get('title','')} "
        f"at {req.lead.get('company','')}. "
        f"Industry: {req.lead.get('industry','')}."
    )
    embedding = await asyncio.to_thread(EmbeddingService().embed_text, profile_text)
    gateway = get_gateway()
    result = gateway.call(
        "store_lead_network",
        {"lead": req.lead, "topics": req.topics},
        user_id=session["username"],
        role=session.get("role", "viewer"),
        executor=lambda p: network_store.store_lead(
            p["lead"], embedding, p["topics"], req.engaged_via
        ),
    )
    return result


@app.post("/network/backfill")
async def network_backfill(
    background_tasks: BackgroundTasks,
    session: dict = Depends(_require_role("manager")),
):
    """Import all historical leads from the approval queue into Neo4j (runs in background)."""
    async def _do_backfill():
        import boto3
        from agents.relevance.embedding_service import EmbeddingService

        ddb = boto3.resource("dynamodb", region_name=os.environ.get("AWS_REGION", "ap-south-1"))
        table = ddb.Table(os.environ["QUEUE_TABLE"])

        items = []
        scan_kwargs: dict = {}
        while True:
            resp = table.scan(**scan_kwargs)
            items.extend(resp.get("Items", []))
            if "LastEvaluatedKey" not in resp:
                break
            scan_kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]

        svc = EmbeddingService()
        stored, skipped = 0, 0

        for item in items:
            try:
                payload = json.loads(item.get("payload", "{}"))
                citations = payload.get("citations", {})

                lead_id = payload.get("lead_id", "")
                if not lead_id:
                    skipped += 1
                    continue

                # Extract location from prompt preview: "- Location: Cambridge, United States"
                import re as _re
                prompt_preview = ""
                attempt_history = payload.get("attempt_history", [])
                if attempt_history:
                    prompt_preview = attempt_history[0].get("prompt_preview", "")
                loc_match = _re.search(r"Location:\s*([^\n]+)", prompt_preview)
                region = loc_match.group(1).strip() if loc_match else ""

                lead = {
                    "id":           lead_id,
                    "name":         payload.get("lead_name", ""),
                    "title":        payload.get("lead_title", ""),
                    "email":        payload.get("lead_email", ""),
                    "company":      payload.get("company_name", ""),
                    "industry":     citations.get("industry", {}).get("value", ""),
                    "seniority":    citations.get("lead_seniority", {}).get("value", ""),
                    "linkedin_url": citations.get("lead_name", {}).get("url", ""),
                    "region":       region,
                    "domain":       "",
                }

                techs        = citations.get("technologies", {}).get("value", []) or []
                pains        = [p.split()[0].lower() for p in (citations.get("pain_points", {}).get("value", []) or [])[:2]]
                growth       = citations.get("growth_stage", {}).get("value", "")
                industry_tag = lead["industry"].replace(" ", "-").lower() if lead["industry"] else ""
                topics       = list({t.lower() for t in techs[:4]} | set(pains) | {industry_tag, growth.lower()} - {""})[:8]

                profile_text = (
                    f"{lead['name']} {lead['title']} at {lead['company']}. "
                    f"Industry: {lead['industry']}. "
                    f"Tech: {', '.join(techs[:5])}."
                )
                # Extract past roles from attempt_history prompt preview
                # Format: "- Recent roles: Title at Company, Title at Company"
                emp_history = []
                roles_match = _re.search(r"Recent roles:\s*([^\n]+)", prompt_preview)
                if roles_match and roles_match.group(1).strip().lower() not in ("n/a", "none", ""):
                    for role_str in roles_match.group(1).split(","):
                        parts = role_str.strip().split(" at ", 1)
                        if len(parts) == 2:
                            emp_history.append({"title": parts[0].strip(), "company": parts[1].strip(), "current": False})

                embedding = await asyncio.to_thread(svc.embed_text, profile_text)
                network_store.store_lead(lead, embedding, topics, engaged_via="outreach", employment_history=emp_history)
                stored += 1
            except Exception as e:
                logger.warning("backfill skip %s: %s", item.get("pk", "?"), e)
                skipped += 1

        logger.info("Network backfill complete: stored=%d skipped=%d total=%d", stored, skipped, len(items))

    background_tasks.add_task(_do_backfill)
    return {"status": "backfill started in background", "message": "Check /network/leads in ~30s"}
