import json
import os
import re
from anthropic import Anthropic
from .prompt_templates import INITIAL_EMAIL_TEMPLATE, FOLLOW_UP_TEMPLATE, OBJECTION_RESPONSE_TEMPLATE

client = Anthropic()
MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-6")


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

        response = client.messages.create(
            model=MODEL,
            max_tokens=1024,
            system="You are a senior SDR. Always respond with valid JSON.",
            messages=[{"role": "user", "content": prompt}],
        )
        text = re.sub(r"^```(?:json)?\s*", "", response.content[0].text.strip())
        text = re.sub(r"\s*```$", "", text)
        return json.loads(text)

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

        response = client.messages.create(
            model=MODEL,
            max_tokens=512,
            system="You are a senior SDR. Always respond with valid JSON.",
            messages=[{"role": "user", "content": prompt}],
        )
        text = re.sub(r"^```(?:json)?\s*", "", response.content[0].text.strip())
        text = re.sub(r"\s*```$", "", text)
        return json.loads(text)

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

        response = client.messages.create(
            model=MODEL,
            max_tokens=512,
            system="You are a senior SDR. Always respond with valid JSON.",
            messages=[{"role": "user", "content": prompt}],
        )
        text = re.sub(r"^```(?:json)?\s*", "", response.content[0].text.strip())
        text = re.sub(r"\s*```$", "", text)
        return json.loads(text)
