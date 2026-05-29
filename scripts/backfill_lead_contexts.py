"""One-time script to save lead contexts for leads whose outreach emails were
already sent before LeadContextStore existed. Run once; safe to re-run."""

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

import json
from backend.services.apollo.apollo_signals import ApolloSignalsService
from backend.agents.research.research_agent import ResearchAgent
from backend.agents.research.context_builder import ContextBuilder
from backend.services.lead_context_store import LeadContextStore

with open("sample_data/demo_leads.json") as f:
    leads = json.load(f)
with open("sample_data/demo_companies.json") as f:
    companies = json.load(f)

company_map = {c["name"]: c for c in companies}
store = LeadContextStore()

# Only backfill leads that were actually emailed (first 6 in the demo)
TARGET_LEADS = leads[:6]

print("Backfilling lead contexts...")
print("-" * 50)

for lead in TARGET_LEADS:
    company = company_map.get(lead["company"])
    if not company:
        print(f"  SKIP  {lead['email']} — company '{lead['company']}' not found")
        continue

    try:
        signals  = ApolloSignalsService().detect_hiring_trends(company.get("id"), company)
        research = ResearchAgent().research_company(company, signals)
        context  = ContextBuilder().build_lead_context(lead, company, signals, research)

        store.save(lead["email"], lead["id"], context)
        print(f"  SAVED {lead['email']} → lead_id={lead['id']} | {company['name']}")
    except Exception as e:
        print(f"  FAIL  {lead['email']} — {e}")

print("-" * 50)
print("Done. Webhook /api/webhook/inbound-reply can now match replies from these addresses.")
