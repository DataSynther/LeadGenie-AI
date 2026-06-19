"""MCP Tool Registry — single source of truth for READ vs WRITE classification."""

TOOL_REGISTRY: dict[str, dict] = {
    # ── READ — execute directly, no governance ─────────────────────────────────
    "apollo_search":         {"type": "READ",  "governance": False, "description": "Search leads via Apollo API"},
    "enrich_company":        {"type": "READ",  "governance": False, "description": "Enrich company profile"},
    "get_job_postings":      {"type": "READ",  "governance": False, "description": "Fetch open job postings"},
    "get_trends":            {"type": "READ",  "governance": False, "description": "Retrieve market trend signals"},
    "retrieve_memory":       {"type": "READ",  "governance": False, "description": "Read from agent memory"},
    "knowledge_base_query":  {"type": "READ",  "governance": False, "description": "Query knowledge base"},
    "get_research":          {"type": "READ",  "governance": False, "description": "Read research output for a lead"},

    # ── WRITE — always routed through governance ───────────────────────────────
    "reveal_contact":        {"type": "WRITE", "governance": True,  "description": "Reveal masked contact information"},
    "send_email":            {"type": "WRITE", "governance": True,  "description": "Send outreach email to lead"},
    "schedule_meeting":      {"type": "WRITE", "governance": True,  "description": "Book a meeting with lead"},
    "update_crm":            {"type": "WRITE", "governance": True,  "description": "Update CRM record"},
    "create_followup":       {"type": "WRITE", "governance": True,  "description": "Create follow-up task"},
    "send_whatsapp":         {"type": "WRITE", "governance": True,  "description": "Send WhatsApp message"},
}

READ_TOOLS  = {k for k, v in TOOL_REGISTRY.items() if v["type"] == "READ"}
WRITE_TOOLS = {k for k, v in TOOL_REGISTRY.items() if v["type"] == "WRITE"}
