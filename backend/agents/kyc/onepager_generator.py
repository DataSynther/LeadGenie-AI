"""KYC One-Pager Generator — a standalone, citable company briefing.

Every bullet on the page carries a numbered source. Company-fact bullets are
built directly from structured data (no LLM, zero hallucination risk).
Strategic/pain-point bullets are Claude's read on those same facts, and are
labeled as an inference rather than a verified source. Talking points draw
on Ganit's own knowledge base (real past work) where a good match exists.
"""
import json
import os
import re
from anthropic import Anthropic

client = Anthropic()
MODEL = os.getenv("CLAUDE_MODEL_KYC", "claude-haiku-4-5-20251001")

_SRC_APOLLO = "Apollo Company API"
_SRC_AI = "AI Analysis (Claude) — inferred from company profile & hiring signals, not independently verified"


class OnePagerGenerator:
    def generate(
        self,
        company: dict,
        research: dict,
        kb_matches: list[dict],
        funding_trend: dict | None = None,
        sec_revenue: list[dict] | None = None,
        website_pages: list[dict] | None = None,
        website_visit: dict | None = None,
    ) -> dict:
        sources: list[dict] = []

        def add_source(label: str, url: str | None = None) -> int:
            for s in sources:
                if s["label"] == label and s.get("url") == url:
                    return s["id"]
            sid = len(sources) + 1
            entry = {"id": sid, "label": label}
            if url:
                entry["url"] = url
            sources.append(entry)
            return sid

        apollo_id = add_source(_SRC_APOLLO)
        ai_id = add_source(_SRC_AI)

        # ── Company Overview — built directly from real data, no LLM ────────
        overview_bullets = []
        if company.get("industry"):
            overview_bullets.append({"text": f"Industry: {company['industry']}", "source_id": apollo_id})
        if company.get("employee_count"):
            overview_bullets.append({"text": f"{company['employee_count']:,} employees", "source_id": apollo_id})
        if company.get("revenue"):
            overview_bullets.append({"text": f"Revenue: ${company['revenue']}", "source_id": apollo_id})
        if company.get("funding_stage"):
            overview_bullets.append({"text": f"Funding stage: {company['funding_stage']}", "source_id": apollo_id})
        if company.get("headcount_growth_12m"):
            overview_bullets.append({"text": f"Headcount growth (12m): {company['headcount_growth_12m']}", "source_id": apollo_id})
        if company.get("description"):
            overview_bullets.append({"text": company["description"], "source_id": apollo_id})

        # ── Market Context — real, cited funding trend if one was matched ───
        market_bullets = []
        if funding_trend and funding_trend.get("title"):
            fid = add_source(funding_trend.get("source") or "Market report", funding_trend.get("url"))
            market_bullets.append({"text": funding_trend["title"], "source_id": fid})

        # ── Financial Performance — real, dated, SEC-cited (US public companies only) ──
        finance_bullets = []
        for q in (sec_revenue or []):
            sid = add_source(f"SEC EDGAR filing ({q['form']}, filed {q['filed']})", q.get("url"))
            finance_bullets.append({
                "text": f"Revenue for quarter ending {q['end']}: ${q['revenue_usd']:,}",
                "source_id": sid,
            })

        # ── From the Company — short extracts from the company's own site ──────
        website_bullets = self._build_website_highlights(company, website_pages, add_source)

        # ── Website Engagement — has THIS company visited OUR site? (Leadfeeder) ──
        engagement_bullets = []
        if website_visit:
            lf_id = add_source("Leadfeeder", "https://app.leadfeeder.com")
            parts = [f"{website_visit['company_name']} has visited our website"]
            if website_visit.get("visit_count"):
                parts.append(f"{website_visit['visit_count']} visit(s)")
            if website_visit.get("pageviews"):
                parts.append(f"{website_visit['pageviews']} pageview(s)")
            if website_visit.get("last_visit"):
                parts.append(f"last seen {website_visit['last_visit']}")
            engagement_bullets.append({"text": " — ".join(parts), "source_id": lf_id})

        # ── Strategic direction / pain points — from research_agent, AI-inferred ──
        strategy_bullets = [
            {"text": p, "source_id": ai_id} for p in (research.get("strategic_priorities") or [])
        ]
        if research.get("growth_stage"):
            strategy_bullets.insert(0, {"text": f"Growth stage: {research['growth_stage']}", "source_id": ai_id})

        pain_bullets = [
            {"text": p, "source_id": ai_id} for p in (research.get("likely_pain_points") or [])
        ]

        # ── Talking points — Claude blends pain points with Ganit's real KB ──
        talking_points, kb_source_ids = self._build_talking_points(company, research, kb_matches, add_source)

        headline = research.get("summary") or f"{company.get('name', 'This company')} — briefing"

        return {
            "company_name": company.get("name"),
            "headline": headline,
            "sections": [
                {"title": "Company Overview", "bullets": overview_bullets},
                *([{"title": "Financial Performance", "bullets": finance_bullets}] if finance_bullets else []),
                *([{"title": "Market Context", "bullets": market_bullets}] if market_bullets else []),
                *([{"title": "From the Company", "bullets": website_bullets}] if website_bullets else []),
                *([{"title": "Website Engagement", "bullets": engagement_bullets}] if engagement_bullets else []),
                {"title": "Strategic Direction", "bullets": strategy_bullets},
                {"title": "Pain Points & Challenges", "bullets": pain_bullets},
                {"title": "Suggested Talking Points", "bullets": talking_points},
            ],
            "sources": sources,
        }

    def _build_website_highlights(
        self, company: dict, website_pages: list[dict] | None, add_source
    ) -> list[dict]:
        """Extract a couple of short, factual statements straight from the
        company's own site — cited to that exact page, not to AI inference."""
        if not website_pages:
            return []

        pages_text = "\n\n".join(
            f"[Page: {p['url']}]\n{p['text'][:1500]}" for p in website_pages
        )
        prompt = f"""Below is raw text extracted from {company.get('name')}'s own website.

{pages_text}

Pull out up to 3 short, notable factual statements about the company's current
positioning, products, or initiatives — things the company says about itself,
not your own analysis. Paraphrase for brevity but do not invent anything not
present in the text. For each, note which page URL it came from.

Respond as a JSON array only: [{{"text": "...", "page_url": "..."}}]
If nothing notable is present, respond with an empty array []."""

        try:
            response = client.messages.create(
                model=MODEL, max_tokens=400,
                messages=[{"role": "user", "content": prompt}],
            )
            text = response.content[0].text.strip()
            text = re.sub(r"^```(?:json)?\s*", "", text)
            text = re.sub(r"\s*```$", "", text)
            items = json.loads(text)
        except Exception:
            return []

        bullets = []
        for item in items:
            page_url = item.get("page_url")
            sid = add_source("Company Website", page_url)
            bullets.append({"text": item.get("text", ""), "source_id": sid})
        return bullets

    def _build_talking_points(
        self, company: dict, research: dict, kb_matches: list[dict], add_source
    ) -> tuple[list[dict], list[int]]:
        ai_id = add_source(_SRC_AI)
        kb_text = "\n".join(
            f"- [{m.get('id')}] {m.get('claim')}" for m in kb_matches
        ) or "No closely matching past work available."

        prompt = f"""You are prepping a salesperson for a conversation with {company.get('name')}.

Company facts: industry={company.get('industry')}, employees={company.get('employee_count')}, revenue={company.get('revenue')}
Pain points: {', '.join(research.get('likely_pain_points', []) or [])}
Strategic priorities: {', '.join(research.get('strategic_priorities', []) or [])}

Ganit's relevant past work (cite by [id] if you use one, never invent a claim not listed here):
{kb_text}

Produce 3-5 short, specific CXO conversation-starter talking points as a JSON array of
objects: [{{"text": "...", "kb_id": "record_id or null"}}]. Use ONLY the facts above —
no invented metrics or client names. If a talking point doesn't reference Ganit's past
work, set kb_id to null.

Respond with valid JSON array only."""

        response = client.messages.create(
            model=MODEL, max_tokens=500,
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.content[0].text.strip()
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
        try:
            raw_points = json.loads(text)
        except json.JSONDecodeError:
            raw_points = []

        kb_by_id = {m["id"]: m for m in kb_matches}
        bullets = []
        used_ids = []
        for p in raw_points:
            kb_id = p.get("kb_id")
            if kb_id and kb_id in kb_by_id:
                sid = add_source(f"Ganit Knowledge Base — {kb_by_id[kb_id].get('category')}")
                used_ids.append(sid)
            else:
                sid = ai_id
            bullets.append({"text": p.get("text", ""), "source_id": sid})
        return bullets, used_ids
