import json
import os
import re
from anthropic import Anthropic

from observability.agent_tracer import AgentTracer
from observability.validator import Validator
from observability.self_evaluator import self_evaluate, context_to_summary

client = Anthropic()
MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-6")


class ResearchAgent:
    """Uses Claude to generate company research summaries and pain point analysis."""

    def research_company(self, company: dict, signals: dict, lead_id: str = None) -> dict:
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
        context = {"company": company, "signals": signals}
        tracer = AgentTracer(agent="research", lead_id=lead_id, context=context, prompt_version="research_v1")

        with tracer.trace(prompt=prompt) as t:
            response = client.messages.create(
                model=MODEL,
                max_tokens=1024,
                messages=[{"role": "user", "content": prompt}],
            )
            text = response.content[0].text.strip()
            text = re.sub(r"^```(?:json)?\s*", "", text)
            text = re.sub(r"\s*```$", "", text)
            result = json.loads(text)
            t.finish(response)
            t.set_self_eval(self_evaluate("research", json.dumps(result)[:400], context_to_summary(context)))
            validation = Validator("research", lead_id=lead_id, context=context).validate(result, tracker=t)
            result["_validation"] = validation["consequence"]
        return result

    def detect_pain_points(self, context: dict) -> list[str]:
        """Extract likely pain points from company context."""
        return context.get("likely_pain_points", [])
