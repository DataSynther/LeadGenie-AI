class ContextBuilder:
    """Assembles a unified lead context object from all intelligence sources."""

    def build_lead_context(self, lead: dict, company: dict, signals: dict, research: dict) -> dict:
        """Combine lead, company, signal, and research data into a single context payload."""
        # employment_history: keep only current + most recent past role for prompt brevity
        emp = lead.get("employment_history") or []
        recent_roles = [f"{j['title']} at {j['company']}" for j in emp if j.get("title") and j.get("company")]

        # headcount growth: prefer live-enriched lead value, fall back to company record
        def _pct(raw):
            if raw is None:
                return None
            if isinstance(raw, str):
                return raw  # already formatted (e.g. "6.5%")
            return f"{round(raw * 100, 1)}%"

        headcount_growth = (
            _pct(lead.get("org_headcount_growth_12m"))
            or _pct(company.get("headcount_growth_12m"))
        )

        return {
            "lead": {
                "id": lead.get("id"),
                "name": lead.get("name"),
                "title": lead.get("title"),
                "headline": lead.get("headline"),
                "seniority": lead.get("seniority"),
                "department": lead.get("department"),
                "city": lead.get("city"),
                "country": lead.get("country"),
                "linkedin_url": lead.get("linkedin_url"),
                "recent_roles": recent_roles,
            },
            "company": {
                "name": company.get("name") or lead.get("company"),
                "industry": company.get("industry") or lead.get("org_industry"),
                "employee_count": company.get("employee_count") or lead.get("org_employees"),
                "funding_stage": company.get("funding_stage"),
                "technologies": company.get("technologies") or lead.get("org_tech_stack", []),
                "description": company.get("description") or lead.get("org_description"),
                "revenue": company.get("revenue") or lead.get("org_revenue"),
                "headcount_growth_12m": headcount_growth,
                "keywords": lead.get("org_keywords", []),
            },
            "signals": {
                "open_roles": signals.get("total_open_roles"),
                "ai_hiring": signals.get("ai_hiring"),
                "scaling": signals.get("scaling_signal"),
            },
            "research": {
                "summary": research.get("summary"),
                "growth_stage": research.get("growth_stage"),
                "pain_points": research.get("likely_pain_points", []),
                "ai_readiness_score": research.get("ai_readiness_score"),
                "strategic_priorities": research.get("strategic_priorities", []),
            },
        }

    def identify_growth_stage(self, company: dict) -> str:
        """Classify company into growth stage based on employee count and funding."""
        employees = company.get("employee_count") or 0
        funding = (company.get("funding_stage") or "").lower()

        if "series c" in funding or "series d" in funding or employees > 500:
            return "scale-up"
        if "series a" in funding or "series b" in funding or employees > 50:
            return "growth"
        if "seed" in funding or employees <= 50:
            return "early-stage"
        return "unknown"
