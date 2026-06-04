"""Categorizes a lead into an outreach stream and domain using keyword rules + Haiku fallback."""
from __future__ import annotations

import os
from anthropic import Anthropic

client = Anthropic()
MODEL = os.getenv("CLAUDE_MODEL_CATEGORIZER", "claude-haiku-4-5-20251001")

STREAMS = ("data_science", "data_engineering", "product", "devops", "generic")
DOMAINS = ("fintech", "healthcare", "ecommerce", "saas", "logistics", "telecom", "media", "manufacturing", "generic")

_RULES: dict[str, list[str]] = {
    "data_science": [
        "data scientist", "machine learning", "ml engineer", "ai engineer",
        "analytics engineer", "data analyst", "applied scientist", "research scientist",
        "nlp engineer", "computer vision", "deep learning", "ai researcher",
    ],
    "data_engineering": [
        "data engineer", "etl", "data platform", "data infrastructure",
        "data architect", "dbt", "pipeline engineer", "data reliability",
        "lakehouse", "data ops", "dataops", "stream processing",
    ],
    "product": [
        "product manager", "product director", "vp product", "chief product",
        "head of product", "product lead", "product owner", "cpo",
        "vp of product",
    ],
    "devops": [
        "devops", "sre", "site reliability", "platform engineer",
        "infrastructure engineer", "cloud engineer", "kubernetes",
        "terraform", "devsecops", "mlops", "platform engineering",
        "cloud architect", "cloud ops",
    ],
}


def _keyword_match(text: str) -> str | None:
    lower = text.lower()
    for stream, keywords in _RULES.items():
        if any(kw in lower for kw in keywords):
            return stream
    return None


_DOMAIN_RULES: dict[str, list[str]] = {
    "fintech": [
        "financial services", "fintech", "banking", "insurance", "payments",
        "lending", "investment", "wealth management", "bfsi", "nbfc", "asset management",
        "credit", "capital markets", "stock", "brokerage",
    ],
    "healthcare": [
        "healthcare", "health care", "pharma", "pharmaceutical", "biotech",
        "medical", "life sciences", "hospital", "clinical", "diagnostics",
    ],
    "ecommerce": [
        "retail", "e-commerce", "ecommerce", "consumer goods", "cpg", "fmcg",
        "qsr", "grocery", "fashion", "apparel", "marketplace",
    ],
    "saas": [
        "software", "saas", "cloud", "enterprise software", "platform",
        "technology", "tech", "information technology", "it services",
    ],
    "logistics": [
        "logistics", "supply chain", "transportation", "freight", "shipping",
        "delivery", "warehouse", "fulfilment", "fulfillment",
    ],
    "telecom": [
        "telecommunications", "telecom", "mobile", "wireless", "broadband",
        "internet service", "network",
    ],
    "media": [
        "media", "entertainment", "publishing", "advertising", "broadcast",
        "streaming", "content", "gaming",
    ],
    "manufacturing": [
        "manufacturing", "semiconductor", "automotive", "industrial",
        "electronics", "chemical", "aerospace", "fmcg manufacturing",
    ],
}


def _domain_keyword_match(text: str) -> str | None:
    lower = text.lower()
    for domain, keywords in _DOMAIN_RULES.items():
        if any(kw in lower for kw in keywords):
            return domain
    return None


class DomainDetector:
    """Detects the horizontal domain (industry) of a company — rule-based + Haiku fallback."""

    def detect(self, company: dict) -> str:
        """Return a domain label for this company."""
        search_text = " ".join(filter(None, [
            company.get("industry", ""),
            company.get("name", ""),
            company.get("description", "") or "",
        ]))
        result = _domain_keyword_match(search_text)
        if result:
            return result
        return self._llm_detect(search_text)

    def _llm_detect(self, company_text: str) -> str:
        prompt = (
            f"Classify this company into exactly one domain.\n"
            f"Company info: {company_text[:300]}\n"
            f"Domains: {', '.join(DOMAINS)}\n"
            "Reply with exactly one domain name and nothing else."
        )
        try:
            response = client.messages.create(
                model=MODEL,
                max_tokens=16,
                messages=[{"role": "user", "content": prompt}],
            )
            raw = response.content[0].text.strip().lower()
            for d in DOMAINS:
                if d in raw:
                    return d
        except Exception:
            pass
        return "generic"


class TemplateCategorizer:
    """Hybrid categorizer: keyword rules first, Haiku LLM fallback for ambiguous profiles."""

    def categorize(self, lead: dict, company: dict) -> str:
        """Return a stream label for this lead."""
        search_text = " ".join(filter(None, [
            lead.get("title", ""),
            lead.get("headline", ""),
            " ".join(lead.get("departments", []) or []),
        ]))

        result = _keyword_match(search_text)
        if result:
            return result

        return self._llm_categorize(search_text, company.get("industry", ""))

    def _llm_categorize(self, profile_text: str, industry: str) -> str:
        prompt = (
            f"Classify this B2B lead into exactly one stream.\n"
            f"Profile: {profile_text[:300]}\n"
            f"Industry: {industry}\n"
            f"Streams: {', '.join(STREAMS)}\n"
            "Reply with exactly one stream name and nothing else."
        )
        try:
            response = client.messages.create(
                model=MODEL,
                max_tokens=16,
                messages=[{"role": "user", "content": prompt}],
            )
            raw = response.content[0].text.strip().lower()
            for s in STREAMS:
                if s in raw:
                    return s
        except Exception:
            pass
        return "generic"
