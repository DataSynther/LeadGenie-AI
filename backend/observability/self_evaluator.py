"""Lightweight Claude self-evaluation after each agent call.

Asks Claude: "Did you have enough information to answer this confidently?"
Returns a real confidence signal for CATEGORY_TASK_MISMATCH detection,
covering all agents — not just intent_detector.

Call is intentionally cheap: max_tokens=180, no system prompt, minimal context.
Never blocks the main pipeline — all exceptions return None silently.

Set OBSERVABILITY_SELF_EVAL=false to disable (reduces API calls in production).
"""
import json
import logging
import os
import re
from typing import Optional

from anthropic import Anthropic

logger = logging.getLogger(__name__)

_client = Anthropic()
_MODEL = os.getenv("CLAUDE_MODEL_SELF_EVAL") or os.getenv("CLAUDE_MODEL", "claude-haiku-4-5-20251001")
_ENABLED = os.getenv("OBSERVABILITY_SELF_EVAL", "true").lower() == "true"


def self_evaluate(
    agent: str,
    response_text: str,
    context_summary: str,
    prompt_preview: str = "",
) -> Optional[dict]:
    """Ask Claude to rate its own output quality.

    Returns:
        {
            "confidence": 0.0–1.0,         # self-assessed accuracy confidence
            "sufficient_info": bool,        # had enough context to be accurate
            "uncertain_claims": [...],      # specific claims it was unsure about
            "explanation": "..."            # one sentence
        }
        or None if disabled or call fails.
    """
    if not _ENABLED:
        return None

    eval_prompt = (
        f'You just completed a "{agent}" task.\n\n'
        f"Context you had:\n{context_summary[:400]}\n\n"
        f"Output you produced:\n{response_text[:500]}\n\n"
        "Self-assess honestly. Respond with JSON only:\n"
        '{"confidence": <0.0-1.0>, '
        '"sufficient_info": <true/false>, '
        '"uncertain_claims": [<up to 3 specific claims you were uncertain about, or empty>], '
        '"explanation": "<one sentence: what limited your confidence or \'sufficient context\' if confident>"}'
    )

    try:
        response = _client.messages.create(
            model=_MODEL,
            max_tokens=180,
            messages=[{"role": "user", "content": eval_prompt}],
        )
        text = re.sub(r"^```(?:json)?\s*", "", response.content[0].text.strip())
        text = re.sub(r"\s*```$", "", text)
        result = json.loads(text)
        result["confidence"] = float(max(0.0, min(1.0, result.get("confidence", 0.5))))
        result["sufficient_info"] = bool(result.get("sufficient_info", True))
        result["uncertain_claims"] = list(result.get("uncertain_claims", []))[:3]
        result["explanation"] = str(result.get("explanation", ""))[:200]
        return result
    except Exception as exc:
        logger.debug("Self-eval failed for agent=%s: %s", agent, exc)
        return None


def context_to_summary(context: dict) -> str:
    """Summarise context dict into a short paragraph for the self-eval prompt."""
    parts = []

    lead = context.get("lead") or {}
    company = context.get("company") or {}
    research = context.get("research") or {}

    if lead.get("name") or lead.get("title"):
        parts.append(f"Lead: {lead.get('name', '')} ({lead.get('title', '')})")
    if company.get("name"):
        line = f"Company: {company['name']}"
        if company.get("industry"):
            line += f", {company['industry']}"
        if company.get("employee_count"):
            line += f", {company['employee_count']} employees"
        parts.append(line)
    if research.get("summary"):
        parts.append(f"Research summary: {research['summary'][:150]}")
    if research.get("pain_points"):
        parts.append("Pain points: " + ", ".join(str(p) for p in research["pain_points"][:3]))

    return "\n".join(parts) if parts else "No structured context provided."
