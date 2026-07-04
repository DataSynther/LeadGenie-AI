"""Kickoff Note Generator — leadership-facing meeting prep notes.

Synthesizes company research with Ganit's own past work (from the sender
knowledge base) into a structured kickoff-meeting brief. Manager/admin only.
"""
import json
import os
import re
from anthropic import Anthropic

client = Anthropic()
MODEL = os.getenv("CLAUDE_MODEL_NOTES", "claude-haiku-4-5-20251001")


class KickoffNoteGenerator:
    """Uses Claude to draft an internal kickoff-meeting note for a target company."""

    def generate(self, company: dict, research: dict, kb_matches: list[dict]) -> dict:
        kb_lines = [
            f"- [{m.get('category')}] {m.get('claim')}"
            + (f" (metric: {m['metric']})" if m.get("metric") else "")
            for m in kb_matches
        ]
        kb_text = "\n".join(kb_lines) or "No closely matching past work found in the knowledge base."

        prompt = f"""You are preparing an internal kickoff-meeting brief for Ganit's leadership
team ahead of a meeting with a prospective client. Use ONLY the facts given below —
do not invent client names, metrics, or details not present in the source data.

Target Company:
- Name: {company.get('name')}
- Industry: {company.get('industry')}
- Employees: {company.get('employee_count')}
- Revenue: {company.get('revenue')}
- Funding Stage: {company.get('funding_stage')}
- Technologies: {', '.join(company.get('technologies', []) or [])}
- Description: {company.get('description')}

AI Research Summary:
- Growth stage: {research.get('growth_stage')}
- Likely pain points: {', '.join(research.get('likely_pain_points', []) or [])}
- Strategic priorities: {', '.join(research.get('strategic_priorities', []) or [])}

Ganit's relevant past work (cite these claims exactly — never embellish the metrics,
never attach them to a named client unless the claim itself names one):
{kb_text}

Produce a JSON kickoff note with keys:
- headline: one-line framing of the opportunity (string)
- company_snapshot: 2-3 sentence summary of who they are and why they matter (string)
- likely_pain_points: array of strings — the pain points above, rephrased for an internal audience
- relevant_ganit_work: array of objects {{"claim": string, "why_relevant": string}} — pick from the
  past-work list above and explain in one sentence why each is relevant to THIS company's stack/pain points.
  If nothing matches well, return an empty array — do not force a weak match.
- talking_points: array of 3-5 strings — suggested angles for the kickoff conversation
- open_questions: array of 2-4 strings — things to clarify with the prospect in the meeting

Respond with valid JSON only.
"""
        response = client.messages.create(
            model=MODEL,
            max_tokens=1200,
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.content[0].text.strip()
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
        return json.loads(text)
