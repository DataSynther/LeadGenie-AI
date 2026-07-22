"""Suggests a starting draft for an achievement-announcement campaign.

Optional convenience only — the leadership user always reviews/edits before
sending. Grounds the suggestion in the sender knowledge base rather than
letting the model invent achievements.
"""
import json
import os
import re
from anthropic import Anthropic

client = Anthropic()
MODEL = os.getenv("CLAUDE_MODEL_CAMPAIGNS", "claude-haiku-4-5-20251001")

# Maps a campaign group to the (vertical, domain) pair used for KB retrieval.
_GROUP_KB_MAP: dict[str, tuple[str, str]] = {
    "data_engineering": ("data_engineering", "generic"),
    "data_science":     ("data_science",     "generic"),
    "cloud":            ("data_engineering", "generic"),
    "data_warehouses":  ("data_engineering", "generic"),
    "devops":           ("data_engineering", "generic"),
    "product":          ("generic",          "generic"),
    "fintech":          ("generic",          "fintech"),
    "healthcare":       ("generic",          "healthcare"),
    "ecommerce":        ("generic",          "ecommerce"),
    "manufacturing":    ("generic",          "manufacturing"),
    "logistics":        ("generic",          "logistics"),
    "generic":          ("generic",          "generic"),
}


class DraftSuggester:
    def __init__(self, sender_kb) -> None:
        self._kb = sender_kb

    def suggest(self, group: str) -> dict:
        vertical, domain = _GROUP_KB_MAP.get(group, ("generic", "generic"))
        matches = self._kb.retrieve(vertical=vertical, domain=domain, category="differentiator", n=2)
        if not matches:
            matches = self._kb.retrieve(vertical=vertical, domain=domain, category="social_proof", n=2)

        kb_text = "\n".join(
            f"- {m.get('claim')}" + (f" (metric: {m['metric']})" if m.get("metric") else "")
            for m in matches
        ) or "No specific claim available — write a general capability announcement."

        prompt = f"""Draft a short achievement-announcement email for Ganit to send to a
segment of subscribers interested in "{group.replace('_', ' ')}". Use ONLY the facts
below — do not invent metrics, client names, or achievements not listed here.

Ganit facts to draw from:
{kb_text}

Respond as JSON: {{"subject": "...", "body": "..."}}
The body should be 3-5 sentences, professional, no exclamation-mark spam, no fabricated specifics.
"""
        response = client.messages.create(
            model=MODEL,
            max_tokens=400,
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.content[0].text.strip()
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
        return json.loads(text)
