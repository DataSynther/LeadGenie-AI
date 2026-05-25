from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional

from backend.services.apollo import ApolloPeopleService, ApolloCompanyService, ApolloSignalsService
from backend.agents.research.research_agent import ResearchAgent
from backend.agents.research.context_builder import ContextBuilder
from backend.agents.trends.trend_agent import TrendAgent
from backend.agents.relevance.relevance_engine import RelevanceEngine
from backend.agents.outreach.outreach_agent import OutreachAgent
from backend.agents.conversation.conversation_agent import ConversationAgent
from backend.governance.risk_engine import RiskEngine
from backend.learning.feedback_collector import FeedbackCollector
from backend.learning.learning_engine import LearningEngine
from backend.scheduling.scheduler import Scheduler

app = FastAPI(
    title="LeadGenie AI — Governed Adaptive SDR Platform",
    description="Autonomous, governed, market-aware AI sales development platform.",
    version="1.0.0",
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
feedback_collector = FeedbackCollector()
learning_engine = LearningEngine()
scheduler = Scheduler()


class LeadSearchRequest(BaseModel):
    domains: list[str]
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


@app.post("/leads/search")
async def search_leads(req: LeadSearchRequest):
    return apollo_people.search_people(req.dict())


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
    from backend.governance.audit_logger import AuditLogger
    return AuditLogger().get_audit_trail(lead_id)
