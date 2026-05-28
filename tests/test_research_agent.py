import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

import json
from backend.services.apollo.apollo_signals import ApolloSignalsService
from backend.agents.research.research_agent import ResearchAgent
from backend.agents.research.context_builder import ContextBuilder

with open("sample_data/demo_companies.json") as f:
    companies = json.load(f)

with open("sample_data/demo_leads.json") as f:
    leads = json.load(f)

company_map = {c["name"]: c for c in companies}
signals_svc = ApolloSignalsService()
research_agent = ResearchAgent()
context_builder = ContextBuilder()

PASS = 0
FAIL = 0

print("=" * 70)
print("RESEARCH AGENT — INPUT / OUTPUT TEST")
print("=" * 70)

for lead in leads[:6]:
    company = company_map.get(lead["company"])
    if not company:
        continue

    print(f"\nLead    : {lead['name']} | {lead['title']}")
    print(f"Company : {company['name']} | {company['industry']}")

    # INPUT — signals
    signals = signals_svc.detect_hiring_trends(company.get("id"), company)
    print(f"\n  INPUT signals:")
    print(f"    growth_6m          : {signals['headcount_growth_6m']}%")
    print(f"    growth_12m         : {signals['headcount_growth_12m']}%")
    print(f"    ai_tech_count      : {signals['ai_hiring']}")
    print(f"    eng_tech_count     : {signals['engineering_expansion']}")
    print(f"    scaling_signal     : {signals['scaling_signal']}")
    print(f"    ai_signal          : {signals['ai_signal']}")
    print(f"    est_new_hires_6m   : {signals['total_open_roles']}")

    # OUTPUT — research
    try:
        research = research_agent.research_company(company, signals)

        growth_stage = research.get("growth_stage")
        ai_score = research.get("ai_readiness_score")
        pain_points = research.get("likely_pain_points", [])
        summary = research.get("summary", "")

        print(f"\n  OUTPUT research:")
        print(f"    growth_stage       : {growth_stage}")
        print(f"    ai_readiness_score : {ai_score}/10")
        print(f"    pain_points        : {len(pain_points)} identified")
        for p in pain_points[:3]:
            print(f"      - {p[:90]}")
        print(f"    summary            : {summary[:120]}...")

        # Validate required fields
        errors = []
        if not growth_stage:
            errors.append("missing growth_stage")
        if ai_score is None:
            errors.append("missing ai_readiness_score")
        if not pain_points:
            errors.append("missing likely_pain_points")
        if not summary:
            errors.append("missing summary")

        # Context builder check
        context = context_builder.build_lead_context(lead, company, signals, research)
        if "lead" not in context or "company" not in context:
            errors.append("context_builder output missing lead/company keys")

        if errors:
            print(f"\n  RESULT: FAIL — {errors}")
            FAIL += 1
        else:
            print(f"\n  RESULT: PASS")
            PASS += 1

    except Exception as e:
        print(f"\n  RESULT: FAIL — {e}")
        FAIL += 1

    print("-" * 70)

print(f"\nSUMMARY: {PASS} passed / {FAIL} failed / {PASS + FAIL} total")
print("=" * 70)
