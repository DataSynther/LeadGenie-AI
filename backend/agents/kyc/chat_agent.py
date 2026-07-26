"""KYC Chat Agent — answers follow-up questions about a company, grounded
strictly in the one-pager context already generated for it (Apollo facts,
SEC filings, website extracts, AI research, Ganit KB matches).

Stateless: the caller passes the full onepager context + conversation
history on every turn. No new data is fetched here — if the answer isn't
in the context, the agent says so rather than guessing.
"""
import os
from anthropic import Anthropic

client = Anthropic()
MODEL = os.getenv("CLAUDE_MODEL_KYC_CHAT", "claude-haiku-4-5-20251001")


def _context_to_text(onepager: dict) -> str:
    lines = []
    for section in onepager.get("sections", []):
        lines.append(f"## {section.get('title')}")
        for bullet in section.get("bullets", []):
            lines.append(f"- {bullet.get('text')} [{bullet.get('source_id')}]")
    lines.append("\n## Sources")
    for s in onepager.get("sources", []):
        line = f"[{s['id']}] {s['label']}"
        if s.get("url"):
            line += f" — {s['url']}"
        lines.append(line)
    return "\n".join(lines)


def _visitor_to_text(visitor: dict) -> str:
    lines = [
        "\n## Detailed Website Visit History (Leadfeeder — not part of the numbered sources above)",
        f"Total visits: {visitor.get('visit_count', 'unknown')}, total pageviews: {visitor.get('pageviews', 'unknown')}, "
        f"last seen: {visitor.get('last_visit', 'unknown')}, first seen: {visitor.get('first_seen', 'unknown')}",
    ]
    for v in (visitor.get("recent_visits") or [])[:10]:
        pages = ", ".join(v.get("pages") or []) or "no pages recorded"
        lines.append(
            f"- {v.get('started_at', 'unknown time')}: came via {v.get('source', 'unknown source')}, "
            f"landed on {v.get('landing_page_path', '?')}, viewed [{pages}], "
            f"spent {v.get('visit_length_seconds', 0)}s on site"
        )
    return "\n".join(lines)


def answer(company_name: str, onepager: dict, message: str, history: list[dict], visitor: dict | None = None) -> str:
    context_text = _context_to_text(onepager)
    if visitor:
        context_text += "\n" + _visitor_to_text(visitor)

    system_prompt = f"""You are a research assistant helping a salesperson understand {company_name}
ahead of a customer conversation. Answer ONLY using the briefing below — every
fact in it is already numbered with a source. When you state something from
the briefing, cite it inline using its existing bracket number, e.g. "[3]".
The Detailed Website Visit History section (if present) is real Leadfeeder
data, not a numbered source — answer from it directly without a bracket
number when asked about site visits, timing, or pages viewed.

If the question asks about something not covered in the briefing (a specific
historical period, a metric that was never fetched, a private company's
financials that SEC EDGAR has no record of, etc.), say plainly that the
information isn't available in this briefing rather than guessing or
estimating. Do not invent numbers, dates, or facts not present below.

=== BRIEFING: {company_name} ===
{context_text}
=== END BRIEFING ==="""

    messages = [{"role": h["role"], "content": h["content"]} for h in history]
    messages.append({"role": "user", "content": message})

    response = client.messages.create(
        model=MODEL,
        max_tokens=500,
        system=system_prompt,
        messages=messages,
    )
    return response.content[0].text.strip()
