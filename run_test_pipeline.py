"""Test pipeline — runs the full outreach pipeline for all 6 test leads.

Each lead's email is a Ganitinc teammate playing the role of the real lead.
All emails have Reply-To pointing to the shared inbox so teammate replies
are caught by the Gmail reply poller and auto-responded to.
"""

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
from services.apollo.apollo_signals import ApolloSignalsService
from services.lead_context_store import LeadContextStore
import time

with open("sample_data/demo_leads.json") as f:
    leads = json.load(f)
with open("sample_data/demo_companies.json") as f:
    companies = json.load(f)

company_map = {c["name"]: c for c in companies}
shared_inbox = __import__("os").getenv("REPLY_TO_EMAIL", "")

print("=" * 65)
print("LEADGENIE AI — TEST PIPELINE (teammate simulation)")
print("=" * 65)
print(f"Shared inbox : {shared_inbox or 'NOT SET — add REPLY_TO_EMAIL to .env'}")
print(f"Running for  : {len(leads[:6])} test leads\n")

SENT = 0
SKIPPED = 0

for lead in leads[:6]:
    company = company_map.get(lead["company"])
    if not company:
        print(f"  SKIP  {lead['name']} — company '{lead['company']}' not found")
        SKIPPED += 1
        continue

    print(f"{'─' * 65}")
    print(f"Lead    : {lead['name']} | {lead['title']}")
    print(f"Company : {company['name']} | {company['industry']}")
    print(f"Tester  : {lead['email']}")

    try:
        # Step 1 — Signals + Research
        signals  = ApolloSignalsService().detect_hiring_trends(company.get("id"), company)
        research = ResearchAgent().research_company(company, signals)
        context  = ContextBuilder().build_lead_context(lead, company, signals, research)

        print(f"  Research : {research.get('growth_stage')} | AI score {research.get('ai_readiness_score')}/10")

        # Step 2 — Trends + Relevance
        trends     = TrendAgent().get_current_trends()
        top_trends = RelevanceEngine().rank_trends(context, trends, top_k=3)

        # Step 3 — Outreach email
        email = OutreachAgent().generate_email(context, top_trends)
        print(f"  Subject  : {email.get('subject')}")

        # Step 4 — Governance check
        source_facts = {
            "company_name": company["name"],
            "industry":     company["industry"],
            "lead_title":   lead["title"],
        }
        gov = RiskEngine().evaluate(lead["id"], email, source_facts)
        status = "APPROVED" if gov["approved"] else f"FLAGGED (risk={gov['risk_score']:.2f})"
        print(f"  Governance: {status}")

        if gov["requires_human_review"]:
            print(f"  Issues   : {gov['issues']}")

        # Step 5 — Send to teammate (reply-to = shared inbox)
        result = EmailSender().send(
            to_email=lead["email"],
            subject=email.get("subject"),
            body=email.get("body"),
        )

        if result["sent"]:
            LeadContextStore().save(lead["email"], lead["id"], context)
            FeedbackCollector().record_outcome(lead["id"], "approved", {"test_mode": True})
            print(f"  Email    : sent ✓ | context saved for reply routing")
            SENT += 1
        else:
            print(f"  Email    : FAILED — {result['error']}")
            SKIPPED += 1

    except Exception as e:
        print(f"  ERROR    : {e}")
        SKIPPED += 1

    print()
    # Voyage AI free tier = 3 RPM, 2 calls per lead → need 40s+ gap
    time.sleep(45)

print("=" * 65)
print(f"DONE — {SENT} sent, {SKIPPED} skipped")
print(f"\nStart the reply poller to auto-handle teammate replies:")
print(f"  python3 scripts/run_reply_poller.py")
print("=" * 65)
