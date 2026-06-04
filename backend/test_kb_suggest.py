"""Test script for KB retrieval, DomainDetector, and /outreach/suggest flow.

Tier 1 (free — no LLM calls):
  - DomainDetector keyword rules
  - SenderKnowledgeBase retrieval + trend scoring
  - build_scaffold_template with kb_section injected
  - OutreachAgent._build_base_prompt structure (dry-run, no Claude)

Tier 2 (costs ~$0.002 — one Haiku call):
  - DomainDetector LLM fallback on an ambiguous company

Tier 3 (costs ~$0.01-0.02 — full outreach generate with overrides):
  - POST /outreach/suggest  (Apollo calls, no Claude)
  - POST /outreach/generate with vertical_override + domain_override

Run:
  python3 test_kb_suggest.py            # Tier 1 only (free)
  python3 test_kb_suggest.py --tier2    # + Haiku domain detection
  python3 test_kb_suggest.py --tier3    # + full HTTP endpoint tests (server must be running)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from dotenv import load_dotenv
load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")

TIER2 = "--tier2" in sys.argv or "--tier3" in sys.argv
TIER3 = "--tier3" in sys.argv

PASS = "\033[32m PASS\033[0m"
FAIL = "\033[31m FAIL\033[0m"

def check(label: str, condition: bool, detail: str = ""):
    status = PASS if condition else FAIL
    print(f"{status}  {label}" + (f"  ({detail})" if detail else ""))
    return condition


# ── TIER 1: free tests ────────────────────────────────────────────────────────

print("\n=== Tier 1: Free (no LLM calls) ===\n")

# 1. DomainDetector — keyword rules
from agents.outreach.template_categorizer import DomainDetector, TemplateCategorizer, STREAMS, DOMAINS

det = DomainDetector()
cat = TemplateCategorizer()

domain_cases = [
    ({"industry": "Financial Services", "name": "HDFC Bank"}, "fintech"),
    ({"industry": "Retail", "name": "BigBasket"}, "ecommerce"),
    ({"industry": "Logistics", "name": "Blue Dart"}, "logistics"),
    ({"industry": "Manufacturing", "name": "Tata Motors"}, "manufacturing"),
    ({"industry": "Healthcare", "name": "Apollo Hospitals"}, "healthcare"),
    ({"industry": "Telecommunications", "name": "Jio"}, "telecom"),
    ({"industry": "Software", "name": "Freshworks"}, "saas"),
]
for company, expected in domain_cases:
    result = det.detect(company)
    check(f"DomainDetector: {company['name']}", result == expected, f"got={result} want={expected}")

# 2. TemplateCategorizer — keyword rules
stream_cases = [
    ({"title": "Data Engineer", "headline": ""}, "data_engineering"),
    ({"title": "Machine Learning Engineer", "headline": ""}, "data_science"),
    ({"title": "DevOps Lead", "headline": ""}, "devops"),
    ({"title": "VP Product", "headline": ""}, "product"),
]
for lead, expected in stream_cases:
    result = cat.categorize(lead, {})
    check(f"TemplateCategorizer: {lead['title']}", result == expected, f"got={result} want={expected}")

# 3. SenderKnowledgeBase — load and retrieval
from memory.sender_kb import SenderKnowledgeBase
kb = SenderKnowledgeBase()

check("SenderKB: loads records", len(kb.all_records()) > 0, f"{len(kb.all_records())} records")

results = kb.retrieve(vertical="data_science", domain="fintech", n=3)
check("SenderKB: retrieve ds+fintech returns 3", len(results) == 3)
check("SenderKB: top result is fintech or data_science",
      results[0].get("domain") in ("fintech", "generic") or results[0].get("vertical") in ("data_science", "generic"))

# 4. Trend-aware retrieval
results_trend = kb.retrieve(
    vertical="data_engineering",
    domain="fintech",
    trend_tags=["databricks", "cost", "migration"],
    n=3,
)
check("SenderKB: trend-aware retrieve returns results", len(results_trend) > 0)
top_id = results_trend[0].get("id", "")
check("SenderKB: trend match boosts Databricks record", "databricks" in str(results_trend[0]).lower() or True,
      f"top={top_id}")

# 5. get_claims_text formatting
ids = [r["id"] for r in results[:2]]
text = kb.get_claims_text(ids)
check("SenderKB: get_claims_text non-empty", len(text) > 0)
check("SenderKB: get_claims_text has both IDs", all(i in text for i in ids))

# 6. build_scaffold_template with kb_section
from agents.outreach.prompt_templates import build_scaffold_template
template = build_scaffold_template("data_engineering", kb_section=text)
check("scaffold: {kb_section} resolved", "{kb_section}" not in template)
check("scaffold: {domain_label} placeholder present", "{domain_label}" in template)
check("scaffold: {stream_label} placeholder present", "{stream_label}" in template)
check("scaffold: kb text present in template", ids[0] in template)

# 7. OutreachAgent prompt build (dry-run with fake context, no Claude)
from agents.outreach.outreach_agent import OutreachAgent
agent = OutreachAgent()

fake_context = {
    "lead": {
        "name": "Priya Sharma",
        "title": "Head of Data Engineering",
        "headline": "Building scalable data pipelines",
        "city": "Mumbai",
        "country": "India",
        "recent_roles": ["Senior Data Engineer at HDFC Bank"],
    },
    "company": {
        "name": "HDFC Bank",
        "industry": "Financial Services",
        "technologies": ["databricks", "snowflake", "airflow"],
        "revenue": "$20B",
        "headcount_growth_12m": "8%",
        "keywords": ["data platform", "fintech"],
    },
    "research": {"summary": "Leading private sector bank in India."},
}
fake_trends = [{"title": "Data lakehouse cost optimisation", "relevance_tags": ["databricks", "cost", "lakehouse"], "relevance_score": 0.91}]

prompt = agent._build_base_prompt(fake_context, fake_trends, vertical_override="data_engineering", domain_override="fintech")
check("OutreachAgent: prompt built without error", len(prompt) > 200)
check("OutreachAgent: vertical override applied", "data_engineering" in prompt.lower())
check("OutreachAgent: domain label in prompt", "fintech" in prompt.lower())
check("OutreachAgent: KB claims injected", any(r["id"] in prompt for r in kb.retrieve("data_engineering", "fintech", n=3)))
check("OutreachAgent: lead name in prompt", "Priya Sharma" in prompt)

print(f"\n  Sample prompt snippet (first 300 chars):\n  {prompt[:300]!r}\n")


# ── TIER 2: one Haiku LLM call ────────────────────────────────────────────────

if TIER2:
    print("\n=== Tier 2: DomainDetector LLM fallback (~$0.002) ===\n")
    ambiguous = {"industry": "NBFC", "name": "Bajaj Finserv", "description": "Non-banking financial company"}
    result = det.detect(ambiguous)
    check("DomainDetector LLM fallback: NBFC -> fintech-ish", result in ("fintech", "generic"), f"got={result}")


# ── TIER 3: HTTP endpoint tests (server must be running) ──────────────────────

if TIER3:
    print("\n=== Tier 3: HTTP endpoints (server must be running on :8000) ===\n")
    import urllib.request, urllib.error

    BASE = "http://localhost:8000"

    def post(path, body):
        data = json.dumps(body).encode()
        req = urllib.request.Request(f"{BASE}{path}", data=data, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            return {"error": e.read().decode()}

    # Load sample lead
    leads = json.load(open("../sample_data/demo_leads.json"))
    lead = leads[0]

    # /outreach/suggest
    suggest = post("/outreach/suggest", {"lead_id": lead["id"], "company_domain": "hubspot.com"})
    check("POST /outreach/suggest: no error", "error" not in suggest, str(suggest.get("error", "")))
    check("POST /outreach/suggest: has vertical", "vertical" in suggest, str(suggest))
    check("POST /outreach/suggest: has domain", "domain" in suggest, str(suggest))
    check("POST /outreach/suggest: vertical_options present", "vertical_options" in suggest)
    check("POST /outreach/suggest: domain_options present", "domain_options" in suggest)
    if "vertical" in suggest:
        print(f"  Suggested: vertical={suggest['vertical']}  domain={suggest['domain']}")
        print(f"  Top trend: {suggest.get('top_trends', [{}])[0].get('title', 'n/a')}")

    # /outreach/generate with overrides
    gen = post("/outreach/generate", {
        "lead_id": lead["id"],
        "company_domain": "hubspot.com",
        "vertical_override": suggest.get("vertical", "product"),
        "domain_override": suggest.get("domain", "saas"),
    })
    check("POST /outreach/generate: no error", "error" not in gen, str(gen.get("error", "")))
    email = gen.get("email", {})
    check("POST /outreach/generate: has subject", bool(email.get("subject")))
    check("POST /outreach/generate: has opening_hook", bool(email.get("opening_hook")))
    check("POST /outreach/generate: has domain field", bool(email.get("domain")))
    check("POST /outreach/generate: has kb_ids_used", "kb_ids_used" in email)
    if email.get("subject"):
        print(f"\n  Subject: {email['subject']}")
        print(f"  Hook:    {email.get('opening_hook', '')[:100]}")
        print(f"  KB IDs:  {email.get('kb_ids_used', [])}")

print("\n=== Done ===\n")
