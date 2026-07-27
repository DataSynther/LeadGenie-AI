import logging
import re
from typing import Optional

import requests

from services.website_fetcher import fetch_company_pages

logger = logging.getLogger(__name__)

_SUFFIX_RE = re.compile(r"\b(inc|llc|ltd|corp|corporation|co|company|group|plc)\.?$", re.IGNORECASE)


def _clean_name(name: str) -> str:
    return _SUFFIX_RE.sub("", name.strip()).strip()


def resolve_domain(company_name: str) -> Optional[str]:
    """Resolve a company name to a likely domain via Clearbit's public,
    keyless autocomplete endpoint — no Apollo/PDL subscription required."""
    query = _clean_name(company_name)
    if not query:
        return None
    try:
        response = requests.get(
            "https://autocomplete.clearbit.com/v1/companies/suggest",
            params={"query": query},
            timeout=5,
        )
        response.raise_for_status()
        suggestions = response.json()
        if suggestions:
            return suggestions[0].get("domain")
    except Exception:
        logger.warning("Domain resolution failed for %r", company_name)
    return None


def resolve_company(company_name_or_domain: str) -> Optional[dict]:
    """Best-effort company profile for any company, without a paid
    enrichment provider. Resolves a domain via Clearbit's free autocomplete
    (or uses the input directly if it already looks like a domain), then
    pulls a short description off the public homepage via website_fetcher.

    Deliberately returns a sparse profile — no firmographics, no contacts —
    rather than nothing, so KYC and company research keep working for
    companies outside our lead index. Never used to source outreach
    targets; those still require a real person resolved via Apollo/demo
    lead data.
    """
    looks_like_domain = "." in company_name_or_domain and " " not in company_name_or_domain
    domain = company_name_or_domain.lower() if looks_like_domain else resolve_domain(company_name_or_domain)
    if not domain:
        return None

    pages = fetch_company_pages(domain)
    description = pages[0]["text"][:400] if pages else None
    name = company_name_or_domain if not looks_like_domain else domain

    return {
        "id": f"web_{domain}",
        "name": name,
        "domain": domain,
        "industry": None,
        "employee_count": None,
        "revenue": None,
        "funding_stage": None,
        "technologies": [],
        "description": description,
        "linkedin_url": None,
        "founded_year": None,
        "city": None,
        "country": None,
        "headcount_growth_12m": None,
        "headcount_growth_6m": None,
        "source": "web_fallback",
    }
