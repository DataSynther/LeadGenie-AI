"""Leadfeeder — company-level website visitor identification.

Best-effort, entirely optional: if LEADFEEDER_API_KEY isn't set, or the
account's plan doesn't include API access, or a request fails for any
reason, this silently returns no data rather than erroring.

Verified end-to-end against a live account (2026-07-26): /accounts,
GET /v1/web-visits/companies (include=company), and POST /v1/web-visits
(filters.company_id) all confirmed working with the field names used
below — this is no longer a docs-only guess.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

import requests

logger = logging.getLogger(__name__)

_API_KEY = os.getenv("LEADFEEDER_API_KEY", "")
_ACCOUNT_ID = os.getenv("LEADFEEDER_ACCOUNT_ID", "")
_BASE_URL = "https://api.leadfeeder.com/v1"
_TIMEOUT_S = 15
_LOOKBACK_DAYS = 90
_MAX_COMPANIES_WITH_DETAIL = 30  # cap the N+1 detail calls in list_recent_visiting_companies


def _headers() -> dict:
    return {"X-Api-Key": _API_KEY, "Content-Type": "application/json"}


def _resolve_account_id() -> str | None:
    if _ACCOUNT_ID:
        return _ACCOUNT_ID
    try:
        resp = requests.get(f"{_BASE_URL}/accounts", headers=_headers(), timeout=_TIMEOUT_S)
        if resp.status_code != 200:
            logger.warning("Leadfeeder /accounts returned %s: %s", resp.status_code, resp.text[:300])
            return None
        accounts = resp.json().get("data") or []
        if accounts:
            return accounts[0].get("id")
        logger.warning("Leadfeeder /accounts returned no accounts")
    except Exception as exc:
        logger.warning("Leadfeeder /accounts request failed: %s", exc)
    return None


def is_configured() -> bool:
    return bool(_API_KEY)


def _date_range() -> tuple[str, str]:
    end = datetime.now(timezone.utc).date()
    start = end - timedelta(days=_LOOKBACK_DAYS)
    return start.isoformat(), end.isoformat()


def _extract_domain(attrs: dict) -> str:
    urls = [attrs.get("url") or ""] + (attrs.get("alternative_urls") or [])
    for u in urls:
        if not u:
            continue
        host = urlparse(u if "//" in u else f"//{u}").netloc or u
        return host.lower().removeprefix("www.")
    return ""


def _matches(company_name: str, domain: str, attrs: dict) -> bool:
    target_name = company_name.strip().lower()
    target_domain = domain.strip().lower().removeprefix("www.")
    name = (attrs.get("name") or "").strip().lower()
    urls = [attrs.get("url") or ""] + (attrs.get("alternative_urls") or [])
    urls_l = [u.lower() for u in urls]
    if name and name == target_name:
        return True
    if target_domain:
        return any(target_domain in u for u in urls_l)
    return False


def _fetch_company_locations(account_id: str, start_date: str, end_date: str, page_size: int = 100) -> list[dict]:
    try:
        resp = requests.get(
            f"{_BASE_URL}/web-visits/companies",
            headers=_headers(),
            params={
                "account_id": account_id,
                "start_date": start_date,
                "end_date": end_date,
                "include": "company",
                "page[size]": page_size,
            },
            timeout=_TIMEOUT_S,
        )
        if resp.status_code != 200:
            logger.warning("Leadfeeder /web-visits/companies returned %s: %s", resp.status_code, resp.text[:300])
            return []
        return resp.json().get("data") or []
    except Exception as exc:
        logger.warning("Leadfeeder /web-visits/companies request failed: %s", exc)
        return []


def _fetch_visit_detail(account_id: str, company_id: str, start_date: str, end_date: str) -> dict | None:
    """Real visit records for one company_id — visit_count/pageviews/last_visit/
    recent_visits (with page paths, for chat-level detail)."""
    try:
        resp = requests.post(
            f"{_BASE_URL}/web-visits",
            headers=_headers(),
            params={"account_id": account_id, "page[size]": 100},
            json={"start_date": start_date, "end_date": end_date, "filters": {"company_id": company_id}},
            timeout=_TIMEOUT_S,
        )
        if resp.status_code != 200:
            logger.warning("Leadfeeder /web-visits returned %s: %s", resp.status_code, resp.text[:300])
            return None
        payload = resp.json()
        visits = payload.get("data") or []
    except Exception as exc:
        logger.warning("Leadfeeder /web-visits request failed: %s", exc)
        return None

    if not visits:
        return None

    visit_count = payload.get("meta", {}).get("pagination", {}).get("total_count", len(visits))
    recent_visits = []
    for v in sorted(visits, key=lambda v: v.get("attributes", {}).get("started_at") or "", reverse=True)[:10]:
        attrs = v.get("attributes") or {}
        engagements = attrs.get("engagements") or []
        recent_visits.append({
            "started_at": attrs.get("started_at"),
            "visit_length_seconds": attrs.get("visit_length"),
            "source": attrs.get("source"),
            "landing_page_path": attrs.get("landing_page_path"),
            "pages": [e.get("page", {}).get("path") for e in engagements if e.get("page", {}).get("path")],
        })
    pageviews = sum(len(rv["pages"]) for rv in recent_visits)
    started_ats = [rv["started_at"] for rv in recent_visits if rv["started_at"]]
    last_visit = max(started_ats) if started_ats else None

    return {
        "visit_count": visit_count,
        "pageviews": pageviews,
        "last_visit": last_visit,
        "recent_visits": recent_visits,
    }


def get_visits_for_company(company_name: str, domain: str = "") -> dict | None:
    """Check whether the specific company we're researching has visited our
    site in the last 90 days — not a general visitor feed. Returns a visit
    summary for that company, or None if it hasn't visited (or data is
    unavailable: no key, no plan access, API error).
    """
    if not _API_KEY or not (company_name or domain):
        return None

    account_id = _resolve_account_id()
    if not account_id:
        return None

    start_date, end_date = _date_range()
    entries = _fetch_company_locations(account_id, start_date, end_date)

    company_id = None
    matched_name = company_name
    seen_ids: set[str] = set()
    for entry in entries:
        comp = (entry.get("relationships") or {}).get("company") or {}
        cid = comp.get("id")
        if not cid or cid in seen_ids:
            continue
        seen_ids.add(cid)
        attrs = comp.get("attributes") or {}
        if _matches(company_name, domain, attrs):
            company_id = cid
            matched_name = attrs.get("name") or company_name
            break

    if not company_id:
        return None

    detail = _fetch_visit_detail(account_id, company_id, start_date, end_date)
    if not detail:
        return None

    return {
        "company_name": matched_name,
        "visit_count": detail["visit_count"],
        "pageviews": detail["pageviews"],
        "last_visit": detail["last_visit"],
    }


def list_recent_visiting_companies(limit: int = 50) -> list[dict]:
    """All companies that have visited the site in the last 90 days — the
    general visitor feed (unlike get_visits_for_company, which checks one
    specific company). Used to populate the Website Visitors panel and to
    sync into our own durable store."""
    if not _API_KEY:
        return []

    account_id = _resolve_account_id()
    if not account_id:
        return []

    start_date, end_date = _date_range()
    entries = _fetch_company_locations(account_id, start_date, end_date, page_size=min(limit, 100))

    companies: list[dict] = []
    seen_ids: set[str] = set()
    for entry in entries:
        comp = (entry.get("relationships") or {}).get("company") or {}
        cid = comp.get("id")
        if not cid or cid in seen_ids:
            continue
        seen_ids.add(cid)
        attrs = comp.get("attributes") or {}
        address = attrs.get("address") or {}
        industries = ((attrs.get("industries") or {}).get("industry") or [])
        companies.append({
            "company_id": cid,
            "name": attrs.get("name") or "",
            "domain": _extract_domain(attrs),
            "industry": industries[0].get("name") if industries else None,
            "city": address.get("city"),
            "country": address.get("country"),
            "employee_count": attrs.get("employee_count"),
            "logo_url": attrs.get("logo_url"),
        })
        if len(companies) >= limit:
            break

    for company in companies[:_MAX_COMPANIES_WITH_DETAIL]:
        detail = _fetch_visit_detail(account_id, company["company_id"], start_date, end_date)
        if detail:
            company.update(detail)

    companies.sort(key=lambda c: c.get("last_visit") or "", reverse=True)
    return companies
