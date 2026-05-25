class ContextBuilder:
    """Assembles a unified lead context object from all intelligence sources."""

    def build_lead_context(self, lead: dict, company: dict, signals: dict, research: dict) -> dict:
        """Combine lead, company, signal, and research data into a single context payload."""
        return {
            "lead": {
                "name": lead.get("name"),
                "title": lead.get("title"),
                "seniority": lead.get("seniority"),
                "department": lead.get("department"),
                "linkedin_url": lead.get("linkedin_url"),
            },
            "company": {
                "name": company.get("name"),
                "industry": company.get("industry"),
                "employee_count": company.get("employee_count"),
                "funding_stage": company.get("funding_stage"),
                "technologies": company.get("technologies", []),
                "description": company.get("description"),
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
