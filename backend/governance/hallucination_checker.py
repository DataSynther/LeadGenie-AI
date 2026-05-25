import os
from anthropic import Anthropic

client = Anthropic()
MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-6")


class HallucinationChecker:
    """Validates generated outreach content against known source facts."""

    def check(self, content: str, source_facts: dict) -> dict:
        """
        Verify generated content doesn't contain fabricated claims.
        Returns: {passed: bool, violations: list, confidence: float}
        """
        facts_text = "\n".join(f"- {k}: {v}" for k, v in source_facts.items())
        prompt = f"""
You are a fact-checking agent for AI-generated sales emails.

Known facts about this lead/company:
{facts_text}

Generated content:
\"\"\"{content}\"\"\"

Check if the generated content contains any factual claims that:
1. Cannot be verified from the known facts
2. Appear to be fabricated or hallucinated
3. Misrepresent the company, role, or context

Respond as JSON with:
- passed: true/false
- violations: list of specific problematic claims (empty if passed)
- confidence: 0.0-1.0 (how confident you are in this assessment)
- explanation: short explanation
"""
        response = client.messages.create(
            model=MODEL,
            max_tokens=512,
            messages=[{"role": "user", "content": prompt}],
        )
        import json
        return json.loads(response.content[0].text)
