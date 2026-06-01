from dotenv import load_dotenv
load_dotenv()

import json
from agents.research.research_agent import ResearchAgent
from agents.research.context_builder import ContextBuilder
from agents.trends.trend_agent import TrendAgent
from agents.relevance.relevance_engine import RelevanceEngine
from agents.outreach.outreach_agent import OutreachAgent
from governance.risk_engine import RiskEngine
from learning.feedback_collector import FeedbackCollector
from services.email_sender import EmailSender

# Load demo data
with open("../sample_data/demo_leads.json") as f:
    leads = json.load(f)
with open("../sample_data/demo_companies.json") as f:
    companies = json.load(f)

# Build a quick lookup: company name -> company dict
company_map = {c["name"]: c for c in companies}

# Pick first lead for the demo run
lead = leads[0]
company = company_map.get(lead["company"], companies[0])

print("=" * 60)
print("LEADGENIE AI — DEMO PIPELINE")
print("=" * 60)
print(f"\nLead   : {lead['name']} | {lead['title']}")
print(f"Company: {company['name']} | {company['industry']} | {company['employee_count']} employees | {company['revenue']}")

# Step 1 — Research
print("\n--- Step 1: Research Agent ---")
signals = {
    "total_open_roles": 20,
    "ai_hiring": 3,
    "engineering_expansion": 5,
    "scaling_signal": True,
    "ai_signal": True,
}
research = ResearchAgent().research_company(company, signals)
print(f"  Growth Stage      : {research.get('growth_stage')}")
print(f"  AI Readiness Score: {research.get('ai_readiness_score')}/10")
print(f"  Pain Points       : {research.get('likely_pain_points')}")
print(f"  Summary           : {research.get('summary', '')[:120]}...")

# Step 2 — Context
print("\n--- Step 2: Context Builder ---")
context = ContextBuilder().build_lead_context(lead, company, signals, research)
print("  Context assembled for:", context["lead"]["name"])

# Step 3 — Trends
print("\n--- Step 3: Trend Intelligence ---")
trends = TrendAgent().get_current_trends()
print(f"  Loaded {len(trends)} market trends")

# Step 4 — Relevance
print("\n--- Step 4: Semantic Relevance Engine ---")
top_trends = RelevanceEngine().rank_trends(context, trends, top_k=3)
for t in top_trends:
    print(f"  [{t['relevance_score']:.3f}] {t['title']}")

# Step 5 — Outreach
print("\n--- Step 5: Outreach Generation ---")
email = OutreachAgent().generate_email(context, top_trends)
print(f"  Subject : {email.get('subject')}")
print(f"  Body    :\n{email.get('body')}")
print(f"  Reasoning: {email.get('reasoning', '')[:100]}...")

# Step 6 — Governance
print("\n--- Step 6: Governance Check ---")
source_facts = {
    "company_name": company["name"],
    "industry": company["industry"],
    "lead_title": lead["title"],
    "revenue": company["revenue"],
}
gov = RiskEngine().evaluate(lead["id"], email, source_facts)
print(f"  Approved         : {gov['approved']}")
print(f"  Risk Score       : {gov['risk_score']}")
print(f"  Issues           : {gov['issues'] or 'None'}")
print(f"  Requires Review  : {gov['requires_human_review']}")
print(f"  Audit Event ID   : {gov['event_id']}")

# Step 7 — Record outcome
print("\n--- Step 7: Feedback ---")
FeedbackCollector().record_outcome(lead["id"], "replied", {"demo": True})
print("  Outcome recorded: replied")

# Step 8 — Send email
print("\n--- Step 8: Send Email ---")
result = EmailSender().send(
    to_email=lead["email"],
    subject=email.get("subject"),
    body=email.get("body"),
)
if result["sent"]:
    print(f"  Email sent to : {result['to']}")
else:
    print(f"  Failed        : {result['error']}")

print("\n" + "=" * 60)
print("PIPELINE COMPLETE")
print("=" * 60)
