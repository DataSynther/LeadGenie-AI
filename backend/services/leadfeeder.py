"""Leadfeeder — company-level website visitor identification.

Best-effort, entirely optional: if LEADFEEDER_API_KEY isn't set, or the
account's plan doesn't include API access, or a request fails for any
reason, this silently returns no data rather than erroring — the KYC
one-pager just omits the "Website Engagement" section.

Verified end-to-end against a live account (2026-07-26): /accounts,
GET /v1/web-visits/companies (include=company), and POST /v1/web-visits
(filters.company_id) all confirmed working with the field names used
below — this is no longer a docs-only guess.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

import requests

_API_KEY = os.getenv("LEADFEEDER_API_KEY", "")
_ACCOUNT_ID = os.getenv("LEADFEEDER_ACCOUNT_ID", "")
_BASE_URL = "https://api.leadfeeder.com/v1"
_TIMEOUT_S = 15
_LOOKBACK_DAYS = 90


def _headers() -> dict:
    return {"X-Api-Key": _API_KEY, "Content-Type": "application/json"}


def _resolve_account_id() -> str | None:
    if _ACCOUNT_ID:
        return _ACCOUNT_ID
    try:
        resp = requests.get(f"{_BASE_URL}/accounts", headers=_headers(), timeout=_TIMEOUT_S)
        if resp.status_code != 200:
            return None
        accounts = resp.json().get("data") or []
        if accounts:
            return accounts[0].get("id")
    except Exception:
        pass
    return None


def is_configured() -> bool:
    return bool(_API_KEY)


def _date_range() -> tuple[str, str]:
    end = datetime.now(timezone.utc).date()
    start = end - timedelta(days=_LOOKBACK_DAYS)
    return start.isoformat(), end.isoformat()


def _matches(company_name: str, domain: str, attrs: dict) -> bool:
    target_name = company_name.strip().lower()
    target_domain = domain.strip().lower().lstrip("www.")
    name = (attrs.get("name") or "").strip().lower()
    urls = [attrs.get("url") or ""] + (attrs.get("alternative_urls") or [])
    urls_l = [u.lower() for u in urls]
    if name and name == target_name:
        return True
    if target_domain:
        return any(target_domain in u for u in urls_l)
    return False


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

    try:
        resp = requests.get(
            f"{_BASE_URL}/web-visits/companies",
            headers=_headers(),
            params={
                "account_id": account_id,
                "start_date": start_date,
                "end_date": end_date,
                "include": "company",
                "page[size]": 100,
            },
            timeout=_TIMEOUT_S,
        )
        if resp.status_code != 200:
            return None
        entries = resp.json().get("data") or []
    except Exception:
        return None

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

    try:
        resp = requests.post(
            f"{_BASE_URL}/web-visits",
            headers=_headers(),
            params={"account_id": account_id, "page[size]": 100},
            json={"start_date": start_date, "end_date": end_date, "filters": {"company_id": company_id}},
            timeout=_TIMEOUT_S,
        )
        if resp.status_code != 200:
            return None
        payload = resp.json()
        visits = payload.get("data") or []
    except Exception:
        return None

    if not visits:
        return None

    visit_count = payload.get("meta", {}).get("pagination", {}).get("total_count", len(visits))
    pageviews = sum(len((v.get("attributes") or {}).get("engagements") or []) for v in visits)
    started_ats = [v.get("attributes", {}).get("started_at") for v in visits if v.get("attributes", {}).get("started_at")]
    last_visit = max(started_ats) if started_ats else None

    return {
        "company_name": matched_name,
        "visit_count": visit_count,
        "pageviews": pageviews,
        "last_visit": last_visit,
    }
