import json
import os
import re
from anthropic import Anthropic
from .prompt_templates import (
    FOLLOW_UP_TEMPLATE,
    OBJECTION_RESPONSE_TEMPLATE,
    build_scaffold_template,
)
from .template_categorizer import TemplateCategorizer, DomainDetector
from memory.industry_outreach_memory import IndustryOutreachMemory
from memory.sender_kb import SenderKnowledgeBase

from observability.agent_tracer import AgentTracer
from observability.validator import Validator
from observability.retrieval_checker import compute_retrieval_score
from observability.self_evaluator import self_evaluate, context_to_summary

client = Anthropic()
MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-6")
SYSTEM = "You are a senior SDR. Always respond with valid JSON."
MAX_CORRECTION_ATTEMPTS = 3

_categorizer = TemplateCategorizer()
_domain_detector = DomainDetector()
_industry_memory = IndustryOutreachMemory()
_sender_kb = SenderKnowledgeBase()


_SENDER_INTRO = (
    "I'm Prashant Biswas from Ganit. We are a full-stack Data & AI company, "
    "recognized by Everest, Forrester, and Analytics India."
)


def _assemble_body(email: dict, add_intro: bool = True) -> dict:
    """Assemble `body` from scaffold slots.

    add_intro=True (default) for initial cold outreach only.
    Pass add_intro=False for follow-ups, objection responses, and
    any reply in an ongoing conversation thread.
    """
    if not email.get("body") and email.get("opening_hook"):
        parts = [
            email.get("opening_hook", ""),
            email.get("value_prop", ""),
            email.get("social_proof", ""),
            email.get("cta", ""),
        ]
        email["body"] = "\n\n".join(p for p in parts if p)
    if add_intro and email.get("body") and not email["body"].startswith(_SENDER_INTRO):
        email["body"] = _SENDER_INTRO + "\n\n" + email["body"]
    return email


def _format_few_shot(examples: list[dict]) -> str:
    if not examples:
        return ""
    lines = ["\nPast examples — learn from these hooks and angles:"]
    for i, ex in enumerate(examples, 1):
        outcome_tag = f"outcome: {ex.get('outcome', 'sent')}"
        lines.append(f"\nExample {i} ({outcome_tag}):")
        lines.append(f'  Subject: "{ex.get("subject", "")}"')
        lines.append(f'  Hook: "{ex.get("hook", "")}"')
    return "\n".join(lines) + "\n"


class OutreachAgent:
    """Generates personalized, market-aware outreach using Claude."""

    def _build_base_prompt(
        self,
        context: dict,
        top_trends: list,
        vertical_override: str | None = None,
        domain_override: str | None = None,
    ) -> str:
        lead = context["lead"]
        company = context["company"]
        research = context["research"]
        top_trend = top_trends[0]["title"] if top_trends else "AI adoption trends"
        trend_tags = top_trends[0].get("relevance_tags", []) if top_trends else []

        stream = vertical_override or _categorizer.categorize(lead, company)
        domain = domain_override or _domain_detector.detect(company)

        examples = _industry_memory.get_examples(stream, n=2)
        few_shot_section = _format_few_shot(examples)

        # Retrieve relevant sender KB claims (Domain B)
        tech_stack = company.get("technologies") or []
        kb_claims = _sender_kb.retrieve(
            vertical=stream,
            domain=domain,
            technologies=tech_stack,
            trend_tags=trend_tags,
            n=2,
        )
        kb_section = _sender_kb.get_claims_text([r["id"] for r in kb_claims])

        location = ", ".join(filter(None, [lead.get("city"), lead.get("country")])) or "N/A"
        recent_roles = lead.get("recent_roles") or []
        keywords = company.get("keywords") or []

        template = build_scaffold_template(stream, few_shot_section, kb_section)
        return template.format(
            name=lead.get("name"),
            title=lead.get("title"),
            headline=lead.get("headline") or "N/A",
            company=company.get("name"),
            industry=company.get("industry") or "N/A",
            location=location,
            recent_roles="; ".join(recent_roles) if recent_roles else "N/A",
            revenue=company.get("revenue") or "N/A",
            headcount_growth=company.get("headcount_growth_12m") or "N/A",
            tech_stack=", ".join(tech_stack[:6]) if tech_stack else "N/A",
            keywords=", ".join(keywords[:5]) if keywords else "N/A",
            company_summary=research.get("summary", ""),
            top_trend=top_trend,
            stream_label=stream,
            domain_label=domain,
        )

    def _get_stream(self, context: dict) -> str:
        """Return the stream for a context — cached if already on the lead dict."""
        lead = context.get("lead", {})
        company = context.get("company", {})
        return _categorizer.categorize(lead, company)

    def generate_email(self, context: dict, top_trends: list) -> dict:
        """Generate outreach email with up to 3 auto-correction attempts if validation fails."""
        lead_id = (context.get("lead") or {}).get("id")

        base_prompt = self._build_base_prompt(context, top_trends)

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
                raw = response.content[0].text.strip()
                _m = re.search(r"\{[\s\S]*\}", raw)
                result = _assemble_body(json.loads(_m.group()) if _m else {})
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
        vertical_override: str | None = None,
        domain_override: str | None = None,
    ) -> dict:
        """One Claude call for outreach generation. Used by GovernanceOrchestrator."""
        lead_id = (context.get("lead") or {}).get("id")
        prompt = self._build_base_prompt(context, top_trends, vertical_override, domain_override) + (correction_note or "")

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
            raw = response.content[0].text.strip()
            _m = re.search(r"\{[\s\S]*\}", raw)
            result = _assemble_body(json.loads(_m.group()) if _m else {})
            t.finish(response)
            t.set_retrieval_score(compute_retrieval_score(result.get("body", ""), context))
            t.set_self_eval(self_evaluate("outreach", result.get("body", ""), context_to_summary(context)))
            t.set_citations(self._build_citations(context, top_trends))
            t.set_attempt_info(attempt, [])
        # Expose the prompt used so GovernanceOrchestrator can record it per attempt
        result["_prompt_used"]      = prompt
        result["_correction_note"]  = correction_note or ""
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
            raw = response.content[0].text.strip()
            _m = re.search(r"\{[\s\S]*\}", raw)
            result = _assemble_body(json.loads(_m.group()) if _m else {}, add_intro=False)
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

    def fix_shape(self, previous_email: dict, missing_fields: list, attempt: int) -> dict:
        """Targeted fix-up for shape-only failures — much cheaper than full regeneration.

        Takes the previous (incomplete) JSON output and asks Claude only to add the
        missing fields, leaving all existing content unchanged.
        """
        if not previous_email or not missing_fields:
            # Fallback: can't fix what we don't have
            return {"_prompt_used": "", "_correction_note": "[shape fix-up: nothing to fix]"}

        missing_str = ", ".join(missing_fields)
        prev_json   = json.dumps(previous_email, indent=2)
        prompt = (
            f"The following JSON email response is missing required fields: {missing_str}\n\n"
            f"Existing email:\n{prev_json}\n\n"
            "Add ONLY the missing fields. Keep all existing content exactly as-is.\n"
            "Required fields: subject (string), opening_hook (string), value_prop (string), "
            "social_proof (string), cta (string), reasoning (string), stream (string).\n"
            "Return the complete corrected JSON only."
        )

        tracer = AgentTracer(
            agent="outreach", lead_id=None, context={},
            prompt_version="outreach_shape_fix_v1",
        )
        with tracer.trace(prompt=prompt, system=SYSTEM) as t:
            response = client.messages.create(
                model=MODEL,
                max_tokens=256,
                system=SYSTEM,
                messages=[{"role": "user", "content": prompt}],
            )
            raw = response.content[0].text.strip()
            _m = re.search(r"\{[\s\S]*\}", raw)
            result = _assemble_body(json.loads(_m.group()) if _m else {})
            t.finish(response)
            t.set_attempt_info(attempt, [])

        result["_prompt_used"]     = prompt
        result["_correction_note"] = f"[shape fix-up: added {missing_str}]"
        return result

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
            raw = response.content[0].text.strip()
            _m = re.search(r"\{[\s\S]*\}", raw)
            result = _assemble_body(json.loads(_m.group()) if _m else {}, add_intro=False)
            t.finish(response)
            Validator("outreach_objection", lead_id=lead_id, context=context).validate(result, tracker=t)
        return result
