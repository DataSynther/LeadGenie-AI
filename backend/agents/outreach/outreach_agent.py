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
MAX_CORRECTION_ATTEMPTS = 3


class OutreachAgent:
    """Generates personalized, market-aware outreach using Claude."""

    def generate_email(self, context: dict, top_trends: list) -> dict:
        """Generate outreach email with up to 3 auto-correction attempts if validation fails."""
        lead = context["lead"]
        company = context["company"]
        research = context["research"]
        top_trend = top_trends[0]["title"] if top_trends else "AI adoption trends"
        lead_id = (context.get("lead") or {}).get("id")

        base_prompt = INITIAL_EMAIL_TEMPLATE.format(
            name=lead.get("name"),
            title=lead.get("title"),
            company=company.get("name"),
            industry=company.get("industry"),
            company_summary=research.get("summary", ""),
            top_trend=top_trend,
            pain_points=", ".join(research.get("pain_points", [])),
        )

        attempt_history = []
        result = {}

        for attempt in range(1, MAX_CORRECTION_ATTEMPTS + 1):
            prompt = base_prompt
            if attempt > 1 and attempt_history:
                correction = self._build_correction_prompt(attempt_history[-1]["issues"], attempt)
                prompt = base_prompt + correction

            tracer = AgentTracer(
                agent="outreach", lead_id=lead_id, context=context,
                prompt_version="outreach_email_v1",
            )
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
                t.set_retrieval_score(compute_retrieval_score(result.get("body", ""), context))
                t.set_self_eval(self_evaluate("outreach", result.get("body", ""), context_to_summary(context)))
                t.set_citations(self._build_citations(context, top_trends))
                validation = Validator("outreach", lead_id=lead_id, context=context).validate(result, tracker=t)
                t.set_attempt_info(attempt, attempt_history)

            attempt_history.append({
                "attempt": attempt,
                "consequence": validation["consequence"],
                "issues": validation["issues"],
                "checkpoints": validation.get("checkpoints", {}),
            })

            if validation["consequence"] == "allow":
                break

        result["_attempt_history"] = attempt_history
        return result

    def generate_single(
        self,
        context: dict,
        top_trends: list,
        correction_note: str = None,
        attempt: int = 1,
    ) -> dict:
        """One Claude call for outreach generation. Used by GovernanceOrchestrator."""
        lead = context["lead"]
        company = context["company"]
        research = context["research"]
        top_trend = top_trends[0]["title"] if top_trends else "AI adoption trends"
        lead_id = (context.get("lead") or {}).get("id")

        base_prompt = INITIAL_EMAIL_TEMPLATE.format(
            name=lead.get("name"),
            title=lead.get("title"),
            company=company.get("name"),
            industry=company.get("industry"),
            company_summary=research.get("summary", ""),
            top_trend=top_trend,
            pain_points=", ".join(research.get("pain_points", [])),
        )
        prompt = base_prompt + (correction_note or "")

        tracer = AgentTracer(
            agent="outreach", lead_id=lead_id, context=context,
            prompt_version="outreach_email_v1",
        )
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
            t.set_retrieval_score(compute_retrieval_score(result.get("body", ""), context))
            t.set_self_eval(self_evaluate("outreach", result.get("body", ""), context_to_summary(context)))
            t.set_citations(self._build_citations(context, top_trends))
            t.set_attempt_info(attempt, [])
        return result

    def _build_correction_prompt(self, issues: list, attempt: int) -> str:
        """Build correction instructions from previous validation failures."""
        lines = [
            f"\n\n--- AUTO-CORRECTION (Attempt {attempt}/{MAX_CORRECTION_ATTEMPTS}) ---",
            "The previous response failed validation. Fix ALL of the following before responding:",
        ]
        for issue in issues:
            if issue.startswith("shape:missing_fields:"):
                fields = issue.replace("shape:missing_fields:", "")
                lines.append(f"  ✗ SHAPE: Missing required JSON fields: {fields}. Your response MUST include these.")
            elif issue.startswith("context:company_name_absent:"):
                name = issue.replace("context:company_name_absent:", "")
                lines.append(f"  ✗ CONTEXT: Company name '{name}' not mentioned. Reference it explicitly in the email.")
            elif "response_too_short" in issue:
                lines.append("  ✗ CONTEXT: Response too short. Write a complete, substantive email body.")
            elif issue.startswith("policy:"):
                lines.append(f"  ✗ POLICY: {issue.replace('policy:', '')}. Revise to comply.")
            else:
                lines.append(f"  ✗ {issue}")
        lines.append("Regenerate the complete JSON response resolving every issue above.")
        return "\n".join(lines)

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
            "explainability": self._build_explainability(context, top_trends),
        }
        return {k: v for k, v in citations.items() if v}

    def _build_explainability(self, context: dict, top_trends: list) -> dict:
        """Pillar 4: explain which context fields and which trend drove the email.

        Returns a dict with:
          context_field_influence – each field's populated state + why it matters
          trend_selection         – scored ranking of all available trends
        """
        lead = context.get("lead") or {}
        company = context.get("company") or {}
        research = context.get("research") or {}

        # ── context field influence map ────────────────────────────────────────
        field_influence = []
        _fields = [
            ("lead.name",              lead.get("name"),                  "personalises greeting & subject"),
            ("lead.title",             lead.get("title"),                 "informs seniority framing"),
            ("company.name",           company.get("name"),               "required for context credibility"),
            ("company.industry",       company.get("industry"),           "selects industry-relevant pain points"),
            ("company.employee_count", company.get("employee_count"),     "tailors scale-related messaging"),
            ("research.summary",       research.get("summary"),           "provides company-specific narrative"),
            ("research.pain_points",   research.get("pain_points"),       "anchors value proposition to known pain"),
            ("research.signals",       research.get("signals"),           "surfaces recent triggers for outreach timing"),
        ]
        for field_path, value, reason in _fields:
            populated = bool(value) and value not in ("", [], None)
            field_influence.append({
                "field":     field_path,
                "populated": populated,
                "value_preview": str(value)[:80] if populated else None,
                "influence": reason,
                "used":      populated,
            })

        # ── trend selection reasoning ──────────────────────────────────────────
        industry = (company.get("industry") or "").lower()
        title    = (lead.get("title") or "").lower()
        pain_str = " ".join(research.get("pain_points") or []).lower()

        scored_trends = []
        for i, trend in enumerate(top_trends or []):
            t_title = (trend.get("title") or "").lower()
            t_body  = (trend.get("summary") or trend.get("description") or "").lower()
            combined = f"{t_title} {t_body}"

            score = 0.0
            reasons = []

            if industry and industry in combined:
                score += 0.4
                reasons.append(f"industry '{industry}' mentioned in trend")
            if any(word in combined for word in title.split()):
                score += 0.3
                reasons.append("lead title keywords match trend content")
            if pain_str and any(w in combined for w in pain_str.split() if len(w) > 4):
                score += 0.3
                reasons.append("pain-point keywords overlap with trend")
            if i == 0:
                score += 0.1
                reasons.append("ranked #1 by TrendAgent relevance score")

            scored_trends.append({
                "title":       trend.get("title"),
                "source":      trend.get("source"),
                "relevance":   round(min(score, 1.0), 2),
                "reasons":     reasons,
                "selected":    i == 0,
            })

        scored_trends.sort(key=lambda x: x["relevance"], reverse=True)

        return {
            "context_field_influence": field_influence,
            "trend_selection":         scored_trends,
            "selected_trend":          (top_trends[0].get("title") if top_trends else None),
        }

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
