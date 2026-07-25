"""Leadfeeder — company-level website visitor identification.

Best-effort, entirely optional: if LEADFEEDER_API_KEY isn't set, or the
account's plan doesn't include API access, or the request shape below
doesn't match their current contract, this silently returns no data
rather than erroring — the KYC one-pager just omits the section.

NOTE: built from Leadfeeder's public API docs without a live key to test
against (unlike SEC EDGAR, which needs no signup). The request/response
shape here may need adjusting once tested against a real account —
this is a best-effort starting point, not verified end-to-end.
"""
from __future__ import annotations

import os
import requests

_API_KEY = os.getenv("LEADFEEDER_API_KEY", "")
_ACCOUNT_ID = os.getenv("LEADFEEDER_ACCOUNT_ID", "")
_BASE_URL = "https://api.leadfeeder.com/v1"
_TIMEOUT_S = 10


def _headers() -> dict:
    return {"X-Api-Key": _API_KEY, "Content-Type": "application/json"}


def _resolve_account_id() -> str | None:
    if _ACCOUNT_ID:
        return _ACCOUNT_ID
    try:
        resp = requests.get(f"{_BASE_URL}/accounts", headers=_headers(), timeout=_TIMEOUT_S)
        if resp.status_code != 200:
            return None
        accounts = resp.json().get("data") or resp.json()
        if isinstance(accounts, list) and accounts:
            return accounts[0].get("id") or accounts[0].get("account_id")
    except Exception:
        pass
    return None


def is_configured() -> bool:
    return bool(_API_KEY)


def get_visits_for_company(company_name: str, domain: str = "", scan_limit: int = 100) -> dict | None:
    """Check whether the specific company we're researching has visited our
    site — not a general visitor feed. Returns a single visit summary for
    that company, or None if it hasn't visited (or data is unavailable for
    any reason: no key, no plan access, API shape mismatch, network error).
    """
    if not _API_KEY or not company_name:
        return None

    account_id = _resolve_account_id()
    if not account_id:
        return None

    try:
        resp = requests.post(
            f"{_BASE_URL}/companies/search",
            headers=_headers(),
            params={"account_id": account_id},
            json={"limit": scan_limit},
            timeout=_TIMEOUT_S,
        )
        if resp.status_code != 200:
            return None
        payload = resp.json()
        companies = payload.get("data") or payload.get("companies") or []
    except Exception:
        return None

    target = company_name.strip().lower()
    domain_l = domain.strip().lower()
    for c in companies:
        name = (c.get("name") or c.get("company_name") or "").strip()
        c_domain = (c.get("domain") or c.get("website") or "").strip().lower()
        if not name:
            continue
        if name.lower() == target or (domain_l and domain_l in c_domain):
            return {
                "company_name": name,
                "visit_count": c.get("visits") or c.get("visit_count"),
                "pageviews": c.get("pageviews") or c.get("page_views"),
                "last_visit": c.get("last_visit_at") or c.get("last_seen"),
            }
    return None
