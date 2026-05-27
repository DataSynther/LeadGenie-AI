from dotenv import load_dotenv
load_dotenv()

import os
import json
import requests
from pathlib import Path

APOLLO_API_KEY = os.getenv("APOLLO_API_KEY")
HEADERS = {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
    "X-Api-Key": APOLLO_API_KEY,
}
BASE_URL = "https://api.apollo.io/v1"
OUTPUT_DIR = Path("sample_data")
OUTPUT_DIR.mkdir(exist_ok=True)


# ---------------------------------------------------------------
# STEP 1 — Search companies in India
# ---------------------------------------------------------------
print("\n=== Step 1: Companies in India ===")

company_payload = {
    "organization_locations": ["India"],
    "organization_num_employees_ranges": ["1,10000"],  # any size
    "per_page": 10,
    "page": 1,
}

resp = requests.post(f"{BASE_URL}/mixed_companies/search", headers=HEADERS, json=company_payload)
resp.raise_for_status()
company_data = resp.json()
companies = company_data.get("organizations", [])

print(f"  Found {len(companies)} companies\n")
for c in companies:
    print(f"  {c.get('name')} | {c.get('industry')} | {c.get('estimated_num_employees')} employees | {c.get('primary_domain')}")

# Save companies
with open(OUTPUT_DIR / "india_companies.json", "w") as f:
    json.dump(companies, f, indent=2)
print(f"\n  Saved to sample_data/india_companies.json")


# ---------------------------------------------------------------
# STEP 2 — Pull leads from those companies
# ---------------------------------------------------------------
print("\n=== Step 2: Leads from those companies ===")

org_ids = [c.get("id") for c in companies if c.get("id")]

lead_payload = {
    "organization_ids": org_ids,
    "person_titles": ["CEO", "CTO", "VP", "Director", "Head of"],
    "per_page": 25,
    "page": 1,
}

resp2 = requests.post(f"{BASE_URL}/mixed_people/api_search", headers=HEADERS, json=lead_payload)
resp2.raise_for_status()
lead_data = resp2.json()
leads = lead_data.get("people", [])

print(f"  Found {len(leads)} leads\n")
for lead in leads:
    print(f"  {lead.get('name')} | {lead.get('title')} | {lead.get('organization', {}).get('name')} | {lead.get('email') or 'no email'}")

# Save leads
with open(OUTPUT_DIR / "india_leads.json", "w") as f:
    json.dump(leads, f, indent=2)
print(f"\n  Saved to sample_data/india_leads.json")
