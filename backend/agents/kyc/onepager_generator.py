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


def _ai_source_label(company: dict, signals: dict | None) -> str:
    """Build a citation that names the exact inputs Claude reasoned over for
    this company, instead of a generic boilerplate disclaimer — so a rep can
    see precisely which facts underpin the inference, not just that one exists."""
    facts = []
    if company.get("industry"):
        facts.append(f"industry ({company['industry']})")
    if company.get("employee_count"):
        facts.append(f"headcount ({company['employee_count']:,} employees)")
    if company.get("revenue"):
        facts.append(f"revenue (${company['revenue']})")
    if company.get("funding_stage"):
        facts.append(f"funding stage ({company['funding_stage']})")
    if company.get("headcount_growth_12m") is not None:
        facts.append(f"12mo headcount growth ({company['headcount_growth_12m']})")
    profile_part = "Apollo company profile — " + ", ".join(facts) if facts else "Apollo company profile"

    signal_bits = []
    signals = signals or {}
    if signals.get("total_open_roles") is not None:
        signal_bits.append(f"{signals['total_open_roles']} est. new hires (6mo)")
    if signals.get("engineering_expansion") is not None:
        signal_bits.append(f"{signals['engineering_expansion']} engineering tech signals")
    if signals.get("ai_hiring") is not None:
        signal_bits.append(f"{signals['ai_hiring']} AI tech signals")
    if signals.get("scaling_signal"):
        signal_bits.append("actively scaling")
    signals_part = f"hiring signals ({', '.join(signal_bits)})" if signal_bits else "hiring signals"

    return f"AI Analysis (Claude) — inferred from {profile_part} & {signals_part}, not independently verified"


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
        signals: dict | None = None,
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

        ai_label = _ai_source_label(company, signals)
        apollo_id = add_source(_SRC_APOLLO)
        ai_id = add_source(ai_label)

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

        # ── Strategic direction / pain points — AI-inferred, each bullet cited
        # to the specific fact(s) it was drawn from, not a blanket disclaimer ──
        strategy_bullets, pain_bullets = self._build_strategic_analysis(company, signals, add_source)

        # ── Talking points — Claude blends pain points with Ganit's real KB ──
        strategic_texts = [b["text"] for b in strategy_bullets if not b["text"].startswith("Growth stage:")]
        pain_texts = [b["text"] for b in pain_bullets]
        talking_points, kb_source_ids = self._build_talking_points(
            company, strategic_texts, pain_texts, kb_matches, add_source, ai_id
        )

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

    def _build_strategic_analysis(
        self, company: dict, signals: dict | None, add_source
    ) -> tuple[list[dict], list[dict]]:
        """Ask Claude for growth stage / strategic priorities / pain points,
        but require a short, factual 'basis' per item naming which exact data
        point it rests on — each bullet then cites its own specific basis
        instead of sharing one generic "AI Analysis" disclaimer for everything."""
        signals = signals or {}
        facts_block = "\n".join(f"- {k}: {v}" for k, v in {
            "Industry": company.get("industry"),
            "Employees": company.get("employee_count"),
            "Revenue": company.get("revenue"),
            "Funding stage": company.get("funding_stage"),
            "12mo headcount growth": company.get("headcount_growth_12m"),
            "Technologies": ", ".join(company.get("technologies", []) or []) or None,
            "Est. new hires (6mo)": signals.get("total_open_roles"),
            "Engineering tech signals": signals.get("engineering_expansion"),
            "AI tech signals": signals.get("ai_hiring"),
            "Actively scaling": signals.get("scaling_signal"),
        }.items() if v is not None)

        prompt = f"""You are an expert B2B sales researcher analyzing {company.get('name')}.

Company & hiring data:
{facts_block}

Identify the company's growth stage, 3-6 strategic priorities, and 3-6 likely pain points.
For EVERY item, you must ground it in one or more of the specific data points above and name
exactly which ones in a short "basis" phrase — e.g. "revenue of $5.1B against Series I funding
stage" or "0 AI tech signals despite an actively-scaling headcount". Never write a vague basis
like "company profile" — always cite the actual number or fact. If you can't ground a claim in
the data given, don't include it.

Respond as JSON only:
{{
  "growth_stage": "...",
  "growth_stage_basis": "...",
  "strategic_priorities": [{{"text": "...", "basis": "..."}}],
  "pain_points": [{{"text": "...", "basis": "..."}}]
}}

Respond with valid JSON only."""

        try:
            response = client.messages.create(
                model=MODEL, max_tokens=900,
                messages=[{"role": "user", "content": prompt}],
            )
            text = response.content[0].text.strip()
            text = re.sub(r"^```(?:json)?\s*", "", text)
            text = re.sub(r"\s*```$", "", text)
            result = json.loads(text)
        except Exception:
            return [], []

        def cite(basis: str | None) -> int:
            basis = (basis or "").strip()
            label = (
                f"AI Analysis (Claude) — based on {basis}, not independently verified"
                if basis else
                "AI Analysis (Claude) — inferred from company profile & hiring signals, not independently verified"
            )
            return add_source(label)

        strategy_bullets = []
        if result.get("growth_stage"):
            strategy_bullets.append({
                "text": f"Growth stage: {result['growth_stage']}",
                "source_id": cite(result.get("growth_stage_basis")),
            })
        for item in (result.get("strategic_priorities") or []):
            if item.get("text"):
                strategy_bullets.append({"text": item["text"], "source_id": cite(item.get("basis"))})

        pain_bullets = []
        for item in (result.get("pain_points") or []):
            if item.get("text"):
                pain_bullets.append({"text": item["text"], "source_id": cite(item.get("basis"))})

        return strategy_bullets, pain_bullets

    def _build_talking_points(
        self, company: dict, strategic_priorities: list[str], pain_points: list[str],
        kb_matches: list[dict], add_source, ai_id: int
    ) -> tuple[list[dict], list[int]]:
        kb_text = "\n".join(
            f"- [{m.get('id')}] {m.get('claim')}" for m in kb_matches
        ) or "No closely matching past work available."

        prompt = f"""You are prepping a salesperson for a conversation with {company.get('name')}.

Company facts: industry={company.get('industry')}, employees={company.get('employee_count')}, revenue={company.get('revenue')}
Pain points: {', '.join(pain_points)}
Strategic priorities: {', '.join(strategic_priorities)}

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
