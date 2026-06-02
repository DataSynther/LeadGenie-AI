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

    def generate_whatsapp_followup(self, context: dict, outreach: dict) -> str:
        """Generate a short WhatsApp follow-up grounded in the original email."""
        lead = context.get("lead", {})
        company = context.get("company", {})
        research = context.get("research", {})
        prompt = f"""
Write one WhatsApp follow-up message for a lead who did not reply to an outreach email yet.

Rules:
- 1 to 3 short sentences.
- Friendly, conversational, and WhatsApp-appropriate.
- Preserve the original email's personalization and topic.
- Do not copy the email body.
- Include a lightweight CTA.
- Return valid JSON only: {{"message": "..."}}

Lead:
- Name: {lead.get("name")}
- Title: {lead.get("title")}

Company:
- Name: {company.get("name")}
- Industry: {company.get("industry")}
- Summary: {research.get("summary", "")}

Original outreach:
- Subject: {outreach.get("subject", "")}
- Body: {outreach.get("body", "")}
- Reasoning: {outreach.get("reasoning", "")}
""".strip()

        response = client.messages.create(
            model=MODEL,
            max_tokens=220,
            system="You write concise, natural WhatsApp sales follow-ups. Always respond with valid JSON.",
            messages=[{"role": "user", "content": prompt}],
        )
        text = re.sub(r"^```(?:json)?\s*", "", response.content[0].text.strip())
        text = re.sub(r"\s*```$", "", text)
        data = json.loads(text)
        return str(data.get("message", "")).strip()

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
