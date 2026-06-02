import json
import os
import re
from anthropic import Anthropic
from .prompt_templates import INITIAL_EMAIL_TEMPLATE, FOLLOW_UP_TEMPLATE, OBJECTION_RESPONSE_TEMPLATE

from observability.agent_tracer import AgentTracer
from observability.validator import Validator
from observability.retrieval_checker import compute_retrieval_score
from observability.self_evaluator import self_evaluate, context_to_summary

client = Anthropic()
MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-6")
SYSTEM = "You are a senior SDR. Always respond with valid JSON."


class OutreachAgent:
    """Generates personalized, market-aware outreach using Claude."""

    def generate_email(self, context: dict, top_trends: list[dict]) -> dict:
        """Generate an initial cold outreach email grounded in lead context and market trends."""
        lead = context["lead"]
        company = context["company"]
        research = context["research"]
        top_trend = top_trends[0]["title"] if top_trends else "AI adoption trends"

        prompt = INITIAL_EMAIL_TEMPLATE.format(
            name=lead.get("name"),
            title=lead.get("title"),
            company=company.get("name"),
            industry=company.get("industry"),
            company_summary=research.get("summary", ""),
            top_trend=top_trend,
            pain_points=", ".join(research.get("pain_points", [])),
        )

        lead_id = (context.get("lead") or {}).get("id")
        tracer = AgentTracer(agent="outreach", lead_id=lead_id, context=context, prompt_version="outreach_email_v1")
        with tracer.trace(prompt=prompt, system=SYSTEM) as t:
            response = client.messages.create(
                model=MODEL,
                max_tokens=1024,
                system=SYSTEM,
                messages=[{"role": "user", "content": prompt}],
            )
            text = re.sub(r"^```(?:json)?\s*", "", response.content[0].text.strip())
            text = re.sub(r"\s*```$", "", text)
            result = json.loads(text)
            t.finish(response)

            # Retrieval check: how well does the email body map back to source context?
            t.set_retrieval_score(compute_retrieval_score(result.get("body", ""), context))

            # Self-evaluation: did the model feel it had enough info?
            t.set_self_eval(self_evaluate("outreach", result.get("body", ""), context_to_summary(context)))

            # Source citations: record provenance of every fact used
            t.set_citations(self._build_citations(context, top_trends))

            Validator("outreach", lead_id=lead_id, context=context).validate(result, tracker=t)
        return result

    def generate_follow_up(self, context: dict, conversation_summary: str) -> dict:
        """Generate a follow-up email based on prior conversation history."""
        lead = context["lead"]
        company = context["company"]

        prompt = FOLLOW_UP_TEMPLATE.format(
            conversation_summary=conversation_summary,
            name=lead.get("name"),
            title=lead.get("title"),
            company=company.get("name"),
        )

        lead_id = (context.get("lead") or {}).get("id")
        tracer = AgentTracer(agent="outreach", lead_id=lead_id, context=context, prompt_version="followup_v1")
        with tracer.trace(prompt=prompt, system=SYSTEM) as t:
            response = client.messages.create(
                model=MODEL,
                max_tokens=512,
                system=SYSTEM,
                messages=[{"role": "user", "content": prompt}],
            )
            text = re.sub(r"^```(?:json)?\s*", "", response.content[0].text.strip())
            text = re.sub(r"\s*```$", "", text)
            result = json.loads(text)
            t.finish(response)
            Validator("outreach", lead_id=lead_id, context=context).validate(result, tracker=t)
        return result

    def _build_citations(self, context: dict, top_trends: list) -> dict:
        """Build source attribution map for each fact used in outreach generation."""
        lead = context.get("lead") or {}
        company = context.get("company") or {}
        research = context.get("research") or {}
        citations = {
            "lead_name":      {"value": lead.get("name"), "source": "Apollo People API", "field": "lead.name"},
            "lead_title":     {"value": lead.get("title"), "source": "Apollo People API", "field": "lead.title"},
            "company_name":   {"value": company.get("name"), "source": "Apollo Company API", "field": "company.name"},
            "industry":       {"value": company.get("industry"), "source": "Apollo Company API", "field": "company.industry"},
            "employee_count": {"value": company.get("employee_count"), "source": "Apollo Company API", "field": "company.employee_count"},
            "pain_points":    {"value": research.get("pain_points"), "source": "Research Agent (AI-generated)", "field": "research.pain_points"},
            "summary":        {"value": (research.get("summary") or "")[:150], "source": "Research Agent (AI-generated)", "field": "research.summary"},
            "top_trends":     [
                {"title": t.get("title"), "source": t.get("source", "Trend Agent"), "url": t.get("url")}
                for t in (top_trends or [])[:3]
            ],
        }
        return {k: v for k, v in citations.items() if v}

    def respond_to_objection(self, context: dict, objection: str) -> dict:
        """Generate a response to a lead's objection."""
        lead = context["lead"]
        company = context["company"]
        research = context["research"]

        prompt = OBJECTION_RESPONSE_TEMPLATE.format(
            name=lead.get("name"),
            title=lead.get("title"),
            company=company.get("name"),
            objection=objection,
            company_summary=research.get("summary", ""),
        )

        lead_id = (context.get("lead") or {}).get("id")
        tracer = AgentTracer(agent="outreach", lead_id=lead_id, context=context, prompt_version="objection_v1")
        with tracer.trace(prompt=prompt, system=SYSTEM) as t:
            response = client.messages.create(
                model=MODEL,
                max_tokens=512,
                system=SYSTEM,
                messages=[{"role": "user", "content": prompt}],
            )
            text = re.sub(r"^```(?:json)?\s*", "", response.content[0].text.strip())
            text = re.sub(r"\s*```$", "", text)
            result = json.loads(text)
            t.finish(response)
            Validator("outreach_objection", lead_id=lead_id, context=context).validate(result, tracker=t)
        return result
