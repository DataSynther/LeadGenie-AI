from pathlib import Path
from dotenv import load_dotenv
import json
import logging
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from typing import Optional

# Setup environment
load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")

logger = logging.getLogger(__name__)

# Load sample data
_COMPANIES_PATH = Path(__file__).parent.parent / "sample_data" / "demo_companies.json"
_SAMPLE_COMPANIES: list[dict] = json.loads(_COMPANIES_PATH.read_text(encoding="utf-8")) if _COMPANIES_PATH.exists() else []

# Import services and agents
from services.apollo import ApolloPeopleService, ApolloCompanyService, ApolloSignalsService
from agents.research.research_agent import ResearchAgent
from agents.research.context_builder import ContextBuilder
from agents.trends.trend_agent import TrendAgent
from agents.relevance.relevance_engine import RelevanceEngine
from agents.outreach.outreach_agent import OutreachAgent
from agents.conversation.conversation_agent import ConversationAgent
from governance.risk_engine import RiskEngine
from learning.feedback_collector import FeedbackCollector
from learning.learning_engine import LearningEngine
from scheduling.scheduler import Scheduler
from scheduling.followup_scheduler import FollowupScheduler
from services.lead_context_store import LeadContextStore
from services.email_sender import EmailSender
from services.twilio_whatsapp import TwilioWhatsApp
from services.whatsapp_conversation_store import WhatsAppConversationStore
from services.render_whatsapp_mailbox import RenderWhatsAppMailbox

# Initialize FastAPI app
app = FastAPI(
    title="LeadGenie AI — Governed Adaptive SDR Platform",
    description="Autonomous, governed, market-aware AI sales development platform.",
    version="1.0.0",
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize components
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
feedback_collector = FeedbackCollector()
learning_engine = LearningEngine()
scheduler = Scheduler()
followup_scheduler = FollowupScheduler()
lead_context_store = LeadContextStore()
whatsapp_conversation_store = WhatsAppConversationStore()
render_whatsapp_mailbox = RenderWhatsAppMailbox()


# Pydantic models for API requests
class LeadSearchRequest(BaseModel):
    company_names: list[str] = []
    titles: list[str] = []
    seniorities: list[str] = ["director", "vp", "c_suite"]
    per_page: int = 10


class OutreachRequest(BaseModel):
    lead_id: str
    company_domain: str


class SendOutreachRequest(BaseModel):
    lead_id: str
    to_email: str
    phone: Optional[str] = None
    subject: str
    body: str
    reasoning: Optional[str] = None
    context: dict


class ConversationRequest(BaseModel):
    lead_id: str
    reply: str
    context: dict


class FeedbackRequest(BaseModel):
    lead_id: str
    outcome: str
    metadata: Optional[dict] = None


class WhatsAppReplyRequest(BaseModel):
    lead_id: str
    message: str


# --- API Endpoints ---

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

    # Use sample company data instead of Apollo enrichment
    company_name = lead.get("company", "")
    company = next(
        (c for c in _SAMPLE_COMPANIES if c["name"].lower() == company_name.lower()),
        None,
    )

    if not company:
        company = {"name": company_name, "industry": "Unknown"}

    # Use local signals instead of Apollo signals
    signals = {
        "total_open_roles": 0,
        "headcount_growth": 2.3,
        "tech_tools": 10,
    }

    # Simple demo research object
    research = {
        "summary": f"Research generated for {company_name}"
    }

    context = context_builder.build_lead_context(lead, company, signals, research)

    # trends = trend_agent.get_current_trends()
    # top_trends = relevance_engine.rank_trends(context, trends, top_k=3)

    top_trends = [
        {
            "title": "AI adoption trends",
            "score": 1.0
        }
    ]

    email = outreach_agent.generate_email(context, top_trends)

    source_facts = {
        "company_name": company.get("name"),
        "industry": company.get("industry"),
        "lead_title": lead.get("title"),
    }
    governance = risk_engine.evaluate(req.lead_id, email, source_facts)

    return {
        "lead": lead,
        "company": company,
        "top_trends": top_trends,
        "email": email,
        "governance": governance,
        "context": context,
    }


@app.post("/outreach/send")
async def send_outreach(req: SendOutreachRequest):
    """Send a reviewed outreach email and store lead context for reply handling."""
    lead = apollo_people.get_person_details(req.lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    if not req.to_email:
        raise HTTPException(status_code=400, detail="Lead email is required")

    email = {"subject": req.subject, "body": req.body}
    source_facts = {
        "company_name": req.context.get("company", {}).get("name"),
        "industry": req.context.get("company", {}).get("industry"),
        "lead_title": lead.get("title"),
    }
    governance = risk_engine.evaluate(req.lead_id, email, source_facts)

    # if not governance.get("approved"):
    #     raise HTTPException(
    #         status_code=400,
    #         detail={
    #             "message": "Outreach failed governance checks",
    #             "governance": governance,
    #         },
    #     )

    result = EmailSender().send(
        to_email=req.to_email,
        subject=req.subject,
        body=req.body,
    )
    if not result.get("sent"):
        raise HTTPException(status_code=502, detail=result.get("error"))

    outreach_context = {
        "subject": req.subject,
        "body": req.body,
        "reasoning": req.reasoning,
    }
    lead_phone = req.phone or lead.get("phone")
    enriched_lead = {
        **req.context.get("lead", {}),
        "email": req.to_email,
        "phone": lead_phone,
    }
    enriched_context = {
        **req.context,
        "lead": enriched_lead,
        "outreach": outreach_context,
    }

    lead_context_store.save(req.to_email, req.lead_id, enriched_context)
    followup = None
    if lead_phone:
        followup = followup_scheduler.schedule_followup(
            lead_id=req.lead_id,
            phone=lead_phone,
            context=enriched_context,
            outreach=outreach_context,
        )

    return {
        "sent": True,
        "to": req.to_email,
        "lead_id": req.lead_id,
        "governance": governance,
        "followup": followup,
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
    """Get approval queue built from sample leads — high/medium risk items."""
    leads = apollo_people.search_people({"per_page": 25})
    queue = []
    snippets = [
        ("Hi {name}, saw {company} just closed a funding round — our pricing typically comes in around $48k annually for teams your size. Worth a 20-min scoping call?", "high", "pricing_mention", "no_explicit_pricing", 0.91),
        ("Hi {name}, loved the recent product launch at {company}. We help teams like yours compress the research-to-outreach cycle significantly.", "medium", "competitor_comparison", "competitor_mention_policy", 0.76),
        ("Hi {name}, noticed {company} is scaling fast. Our platform handles compliance automatically so your team can focus on pipeline.", "medium", "compliance_claim", "factual_accuracy_policy", 0.82),
        ("Hi {name}, your work at {company} caught my attention. I'd love to show you how we're helping similar orgs close deals 2x faster.", "high", "performance_guarantee", "no_guarantees_policy", 0.88),
    ]
    for i, lead in enumerate(leads[:4]):
        snippet_tpl, risk, trigger, policy, conf = snippets[i % len(snippets)]
        queue.append({
            "event_id": f"evt_{lead['id'][:8]}",
            "lead_id": lead["id"],
            "lead_name": lead["name"],
            "lead_title": lead["title"],
            "company_name": lead["company"] or "Unknown",
            "risk_level": risk,
            "risk_score": round(conf - 0.1 + (i * 0.03), 2),
            "timestamp": f"2026-05-27T{10 + i}:{15 + i * 3:02d}:00Z",
            "content_snippet": snippet_tpl.format(name=lead["name"].split()[0], company=lead["company"] or "your company"),
            "trigger": trigger,
            "policy": policy,
            "confidence": conf,
        })
    return queue


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


@app.post("/api/webhook/inbound-reply")
async def inbound_email_reply(request: Request):
    """Receives inbound email replies forwarded by Resend or any email routing service."""
    payload = await request.json()
    data = payload.get("data", {})
    sender_email = data.get("from", "").strip()
    reply_body = (data.get("text") or data.get("html") or "").strip()

    if not sender_email or reply_body == "":
        return {"status": "ignored", "reason": "missing sender or body"}

    stored = lead_context_store.get_by_email(sender_email)
    if not stored:
        logger.warning("Inbound reply from unknown sender: %s", sender_email)
        return {"status": "unknown_sender", "email": sender_email}

    lead_id = stored["lead_id"]
    context = stored["context"]
    before_followup = followup_scheduler.get(lead_id)
    logger.info(
        "Inbound email before mark_replied lead_id=%s followup_status=%s due_at=%s",
        lead_id,
        before_followup.get("status") if before_followup else None,
        before_followup.get("due_at") if before_followup else None,
    )
    marked = followup_scheduler.mark_replied(lead_id)
    after_followup = followup_scheduler.get(lead_id)
    logger.info(
        "Inbound email after mark_replied lead_id=%s changed=%s followup_status=%s replied_at=%s",
        lead_id,
        marked,
        after_followup.get("status") if after_followup else None,
        after_followup.get("replied_at") if after_followup else None,
    )

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


@app.post("/whatsapp")
@app.post("/api/webhook/whatsapp-reply")
async def inbound_whatsapp_reply(request: Request):
    """Receives inbound WhatsApp replies from Twilio and queues them for a human."""
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        payload = await request.json()
    else:
        payload = await request.form()

    sender_phone = (
        payload.get("From")
        or payload.get("from")
        or payload.get("phone")
        or payload.get("sender")
        or ""
    ).strip()
    reply_body = (
        payload.get("Body")
        or payload.get("body")
        or payload.get("message")
        or ""
    ).strip()

    logger.info(
        "Incoming WhatsApp message sender=%s body=%r body_len=%s",
        sender_phone,
        reply_body,
        len(reply_body or ""),
    )

    if not sender_phone or reply_body == "":
        logger.warning("Ignoring WhatsApp webhook with missing sender/body sender=%s", sender_phone)
        return {
            "stored": False,
            "reason": "missing sender or body",
            "sender_present": bool(sender_phone),
            "body_present": bool(reply_body),
            "payload_keys": sorted(payload.keys()),
        }

    mailbox_message = render_whatsapp_mailbox.store_inbound(sender_phone, reply_body)
    import_result = render_whatsapp_mailbox.import_messages([mailbox_message])
    logger.info(
        "Queued WhatsApp reply for human import_result=%s unread_count=%s",
        import_result,
        whatsapp_conversation_store.unread_count(),
    )

    return {
        "stored": import_result.get("imported", 0) > 0 or len(render_whatsapp_mailbox.local_pending()) > 0,
        "message": mailbox_message,
        "import": import_result,
        "pending_count": len(render_whatsapp_mailbox.local_pending()),
        "unread_count": whatsapp_conversation_store.unread_count(),
    }


@app.get("/whatsapp/conversations")
async def whatsapp_conversations():
    """List WhatsApp conversations awaiting human response."""
    sync_result = render_whatsapp_mailbox.import_remote_pending()
    conversations = whatsapp_conversation_store.list_awaiting_human()
    return {
        "unread_count": whatsapp_conversation_store.unread_count(),
        "conversations": conversations,
        "sync": sync_result,
    }


@app.get("/pending-messages")
async def pending_messages():
    """Mailbox endpoint for Render: return raw WhatsApp messages posted by Twilio."""
    messages = render_whatsapp_mailbox.local_pending()
    return {"messages": messages, "count": len(messages)}


@app.get("/whatsapp/debug")
async def whatsapp_debug():
    """Debug the Render mailbox -> local WhatsApp inbox flow."""
    return render_whatsapp_mailbox.debug_status()


@app.post("/whatsapp/conversations/{lead_id}/open")
async def open_whatsapp_conversation(lead_id: str):
    """Mark a WhatsApp conversation notification as read when an admin opens it."""
    record = whatsapp_conversation_store.mark_opened(lead_id)
    if not record:
        raise HTTPException(status_code=404, detail="WhatsApp conversation not found")
    return {
        "unread_count": whatsapp_conversation_store.unread_count(),
        "conversation": whatsapp_conversation_store._summary(record),
    }


@app.post("/whatsapp/reply")
async def send_whatsapp_reply(req: WhatsAppReplyRequest):
    """Send a human-authored WhatsApp reply and store it in conversation history."""
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message is required")

    record = whatsapp_conversation_store.get(req.lead_id)
    stored = lead_context_store.get_by_phone(record.get("phone", "") if record else "")
    if not stored and record:
        stored = {"lead_id": req.lead_id, "context": record.get("context", {})}
    if not record:
        followup = followup_scheduler.get(req.lead_id)
        if followup:
            record = {
                "phone": followup.get("phone"),
                "context": followup.get("context", {}),
            }

    phone = (record or {}).get("phone") or (stored or {}).get("context", {}).get("lead", {}).get("phone")
    if not phone:
        raise HTTPException(status_code=404, detail="WhatsApp phone number not found")

    result = TwilioWhatsApp().send(phone=phone, message=req.message)
    if not result.get("sent"):
        raise HTTPException(status_code=502, detail=result.get("error"))

    context = (stored or {}).get("context") or (record or {}).get("context", {})
    updated = whatsapp_conversation_store.add_message(
        lead_id=req.lead_id,
        context=context,
        direction="outbound",
        message=req.message,
        phone=phone,
    )
    return {
        "sent": True,
        "lead_id": req.lead_id,
        "to": result.get("to") or phone,
        "conversation": whatsapp_conversation_store._summary(updated),
    }


@app.post("/followups/process-due")
async def process_due_followups():
    """Process due WhatsApp follow-ups. Useful for cron or manual testing."""
    return {"processed": followup_scheduler.process_due()}


# --- Helper Functions ---

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
