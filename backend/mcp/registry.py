"""MCP Tool Registry — single source of truth for READ vs WRITE classification."""

TOOL_REGISTRY: dict[str, dict] = {
    # ── READ — execute directly, no governance ─────────────────────────────────
    "apollo_search":         {"type": "READ",  "governance": False, "min_role": "viewer",  "description": "Search leads via Apollo API"},
    "enrich_company":        {"type": "READ",  "governance": False, "min_role": "viewer",  "description": "Enrich company profile"},
    "get_job_postings":      {"type": "READ",  "governance": False, "min_role": "viewer",  "description": "Fetch open job postings"},
    "get_trends":            {"type": "READ",  "governance": False, "min_role": "viewer",  "description": "Retrieve market trend signals"},
    "retrieve_memory":       {"type": "READ",  "governance": False, "min_role": "viewer",  "description": "Read from agent memory"},
    "knowledge_base_query":  {"type": "READ",  "governance": False, "min_role": "viewer",  "description": "Query knowledge base"},
    "get_research":          {"type": "READ",  "governance": False, "min_role": "viewer",  "description": "Read research output for a lead"},

    # ── Network / Knowledge Graph ──────────────────────────────────────────────
    "store_lead_network":    {"type": "WRITE", "governance": False, "min_role": "sdr",     "description": "Persist lead + relationships to Neo4j knowledge graph"},
    "query_lead_network":    {"type": "READ",  "governance": False, "min_role": "viewer",  "description": "Semantic + graph NL query over stored lead network"},
    "get_network_graph":     {"type": "READ",  "governance": False, "min_role": "viewer",  "description": "Return company-lead graph nodes and edges for visualisation"},
    "tag_lead":              {"type": "WRITE", "governance": False, "min_role": "sdr",     "description": "Manually add topic tags to a lead node in the knowledge graph"},
    "enrich_lead_linkedin":  {"type": "WRITE", "governance": False, "min_role": "manager", "description": "Enrich lead profile from LinkedIn via ProxyCurl"},
    "find_leads_by_skill":   {"type": "READ",  "governance": False, "min_role": "viewer",  "description": "Find leads in Neo4j who have a specific skill (PDL-enriched)"},
    "find_leads_by_school":  {"type": "READ",  "governance": False, "min_role": "viewer",  "description": "Find leads in Neo4j who attended a specific school (PDL-enriched)"},
    "seed_pdl_leads":        {"type": "WRITE", "governance": False, "min_role": "manager", "description": "Seed Neo4j from PDL-enriched leads JSON with job history, skills, and education"},

    # ── WRITE — always routed through governance ───────────────────────────────
    "reveal_contact":        {"type": "WRITE", "governance": True,  "min_role": "sdr",     "description": "Reveal masked contact information"},
    "send_email":            {"type": "WRITE", "governance": True,  "min_role": "sdr",     "description": "Send outreach email to lead"},
    "schedule_meeting":      {"type": "WRITE", "governance": True,  "min_role": "sdr",     "description": "Book a meeting with lead"},
    "update_crm":            {"type": "WRITE", "governance": True,  "min_role": "manager", "description": "Update CRM record"},
    "create_followup":       {"type": "WRITE", "governance": True,  "min_role": "sdr",     "description": "Create follow-up task"},
    "send_whatsapp":         {"type": "WRITE", "governance": True,  "min_role": "sdr",     "description": "Send WhatsApp message"},
}

READ_TOOLS  = {k for k, v in TOOL_REGISTRY.items() if v["type"] == "READ"}
WRITE_TOOLS = {k for k, v in TOOL_REGISTRY.items() if v["type"] == "WRITE"}
