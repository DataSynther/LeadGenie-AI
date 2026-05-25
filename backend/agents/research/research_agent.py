import os
from anthropic import Anthropic

client = Anthropic()
MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-6")


class ResearchAgent:
    """Uses Claude to generate company research summaries and pain point analysis."""

    def research_company(self, company: dict, signals: dict) -> dict:
        """Summarize company context and strategic positioning from enriched data."""
        prompt = f"""
You are an expert B2B sales researcher. Analyze the following company data and produce a structured research brief.

Company Data:
- Name: {company.get('name')}
- Industry: {company.get('industry')}
- Employees: {company.get('employee_count')}
- Revenue: {company.get('revenue_estimate')}
- Funding Stage: {company.get('funding_stage')}
- Technologies: {', '.join(company.get('technologies', []))}
- Description: {company.get('description')}

Hiring Signals:
- Open Roles: {signals.get('total_open_roles')}
- AI Hiring: {signals.get('ai_hiring')}
- Engineering Expansion: {signals.get('engineering_expansion')}
- Scaling Signal: {signals.get('scaling_signal')}

Output a JSON with keys: summary, growth_stage, strategic_priorities, likely_pain_points, ai_readiness_score (0-10).
Respond with valid JSON only.
"""
        response = client.messages.create(
            model=MODEL,
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        import json
        return json.loads(response.content[0].text)

    def detect_pain_points(self, context: dict) -> list[str]:
        """Extract likely pain points from company context."""
        return context.get("likely_pain_points", [])
