from dotenv import load_dotenv
load_dotenv()

from backend.services.apollo.apollo_people import ApolloPeopleService
from backend.services.apollo.apollo_company import ApolloCompanyService
from backend.services.apollo.apollo_signals import ApolloSignalsService
import json

# --- 1. Search for leads ---
print("\n=== Lead Search ===")
people = ApolloPeopleService()
leads = people.search_people({
    "domains": ["apollo.io"],          # change to any company domain
    "titles": ["VP of Sales"],
    "seniorities": ["vp", "director"],
    "per_page": 3
})
for lead in leads:
    print(f"  {lead['name']} | {lead['title']} | {lead['company']}")

# --- 2. Enrich a company ---
print("\n=== Company Enrichment ===")
company_svc = ApolloCompanyService()
company = company_svc.enrich_company("apollo.io")   # change to any domain
if company:
    print(f"  Name: {company['name']}")
    print(f"  Industry: {company['industry']}")
    print(f"  Employees: {company['employee_count']}")
    print(f"  Funding: {company['funding_stage']}")
    print(f"  Tech Stack: {company['technologies'][:5]}")

# --- 3. Get hiring signals ---
if leads and leads[0].get("organization_id"):
    print("\n=== Hiring Signals ===")
    signals_svc = ApolloSignalsService()
    signals = signals_svc.detect_hiring_trends(leads[0]["organization_id"])
    print(f"  Open Roles: {signals['total_open_roles']}")
    print(f"  AI Hiring Count: {signals['ai_hiring']}")
    print(f"  Scaling Signal: {signals['scaling_signal']}")
    print(f"  Departments: {signals['department_breakdown']}")
