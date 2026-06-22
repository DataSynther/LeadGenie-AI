import json
import logging
import os
import re
from typing import Optional
from anthropic import Anthropic

client = Anthropic()
# Haiku is sufficient for the structured yes/no JSON fact-check and is ~5x faster
MODEL = os.getenv("CLAUDE_MODEL_HALLUCINATION", "claude-haiku-4-5-20251001")
logger = logging.getLogger(__name__)


class HallucinationChecker:
    """Validates generated content against verified source facts.

    Fact resolution order (highest trust wins):
      1. GroundingMemory[lead_id]  — full Apollo + Research + Trends snapshot
      2. source_facts (caller-supplied) — ephemeral overrides / legacy callers
    Both are merged; grounding is base, source_facts can add or override.
    """

    def __init__(self) -> None:
        from agents.conversation.memory_manager import GroundingMemory
        self._grounding = GroundingMemory()

    def check(
        self,
        content,
        source_facts: Optional[dict] = None,
        lead_id: Optional[str] = None,
    ) -> dict:
        """
        Verify generated content doesn't contain fabricated claims.
        Returns: {passed: bool, violations: list, confidence: float, explanation: str}
        """
        # Layer 1: grounding store (full verified facts for this lead)
        facts: dict = {}
        if lead_id:
            facts.update(self._grounding.read(lead_id))

        # Layer 2: caller-supplied facts (adds or overrides)
        if source_facts:
            facts.update(source_facts)

        if not facts:
            # No facts available — skip check rather than flag everything
            return {
                "passed": True,
                "violations": [],
                "confidence": 0.5,
                "explanation": "No source facts available for verification — check skipped.",
            }

        # Accept either a plain string or a structured email dict (new scaffold format)
        if isinstance(content, dict):
            slots = [
                content.get("opening_hook", ""),
                content.get("value_prop", ""),
                content.get("social_proof", ""),
                content.get("body", ""),
            ]
            content = "\n\n".join(s for s in slots if s) or str(content)

        facts_text = "\n".join(
            f"- {k}: {v}" for k, v in facts.items() if v is not None and v != []
        )
        prompt = f"""You are a fact-checking agent for AI-generated sales emails.

Known facts about this lead/company (verified from Apollo API and Research Agent):
{facts_text}

Generated content:
\"\"\"{content}\"\"\"

Check if the generated content contains any factual claims that:
1. Cannot be verified from the known facts above
2. Appear to be fabricated or hallucinated (numbers, company details, tech stack, events)
3. Misrepresent the company, role, or context

Important: if a fact is NOT in the known facts list, treat it as unverifiable — not as confirmed false.
Flag it as a violation only if it contradicts a known fact OR makes a specific claim (number, name, event) with no basis.

Respond as JSON:
{{
  "passed": true/false,
  "violations": ["specific claim — reason it cannot be verified"],
  "confidence": 0.0-1.0,
  "explanation": "one sentence summary"
}}"""
        try:
            response = client.messages.create(
                model=MODEL,
                max_tokens=256,
                messages=[{"role": "user", "content": prompt}],
            )
            raw = self._extract_text(response).strip()
            logger.info(
                "Hallucination check raw response lead_id=%s model=%s prompt=%s raw_response=%s",
                lead_id,
                MODEL,
                prompt,
                raw,
            )
            # Extract JSON object, handling code fences and surrounding prose.
            match = re.search(r"\{[\s\S]*\}", raw)
            if not match:
                logger.warning(
                    "Hallucination check returned no JSON lead_id=%s model=%s raw_response=%s",
                    lead_id,
                    MODEL,
                    raw,
                )
                return {
                    "passed": False,
                    "violations": ["Hallucination checker returned no JSON payload."],
                    "confidence": 0.0,
                    "explanation": "Hallucination checker response could not be parsed.",
                }

            candidate = match.group()
            try:
                return json.loads(candidate)
            except json.JSONDecodeError as exc:
                logger.warning(
                    "Hallucination check JSON parse failed lead_id=%s model=%s error=%s prompt=%s raw_response=%s candidate=%s",
                    lead_id,
                    MODEL,
                    exc,
                    prompt,
                    raw,
                    candidate,
                )
                return {
                    "passed": False,
                    "violations": [f"Hallucination checker returned invalid JSON: {exc.msg}"],
                    "confidence": 0.0,
                    "explanation": "Hallucination checker response could not be parsed.",
                }
        except Exception as exc:
            logger.exception(
                "Hallucination check failed lead_id=%s model=%s prompt=%s",
                lead_id,
                MODEL,
                prompt,
            )
            return {
                "passed": False,
                "violations": [f"Hallucination checker failed: {exc}"],
                "confidence": 0.0,
                "explanation": "Hallucination checker could not complete.",
            }

    @staticmethod
    def _extract_text(response) -> str:
        blocks = getattr(response, "content", None) or []
        texts = []
        for block in blocks:
            text = getattr(block, "text", None)
            if text:
                texts.append(text)
        if texts:
            return "\n".join(texts)
        return str(response)
