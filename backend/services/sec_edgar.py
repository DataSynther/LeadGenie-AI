"""SEC EDGAR — free, public financial filings data for US-listed companies.

No API key required; SEC's fair-access policy just asks for a descriptive
User-Agent identifying the requester. Covers US-listed public companies
only — private and non-US companies have no CIK and get no data here.
"""
from __future__ import annotations

import os
import time
from datetime import date

import requests

_USER_AGENT = os.getenv("SEC_EDGAR_USER_AGENT", "LeadGenie-AI research@ganitinc.com")
_HEADERS = {"User-Agent": _USER_AGENT}

_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
_FACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"

_ticker_cache: dict | None = None
_ticker_cache_ts: float = 0.0
_CACHE_TTL_S = 24 * 3600


def _load_tickers() -> dict:
    global _ticker_cache, _ticker_cache_ts
    if _ticker_cache and (time.time() - _ticker_cache_ts) < _CACHE_TTL_S:
        return _ticker_cache
    resp = requests.get(_TICKERS_URL, headers=_HEADERS, timeout=15)
    resp.raise_for_status()
    _ticker_cache = resp.json()
    _ticker_cache_ts = time.time()
    return _ticker_cache


def lookup_cik(company_name: str) -> dict | None:
    """Fuzzy-match a company name against SEC's ticker list.

    Returns {cik, ticker, title} or None if there's no confident match —
    the caller (a private or non-US company) simply has no SEC data.
    """
    try:
        tickers = _load_tickers()
    except Exception:
        return None

    name_lower = company_name.strip().lower()
    for v in tickers.values():
        if v["title"].lower() == name_lower:
            return {"cik": v["cik_str"], "ticker": v["ticker"], "title": v["title"]}

    candidates = [
        v for v in tickers.values()
        if v["title"].lower().startswith(name_lower) or name_lower in v["title"].lower()
    ]
    if not candidates:
        return None
    candidates.sort(key=lambda v: len(v["title"]))
    v = candidates[0]
    return {"cik": v["cik_str"], "ticker": v["ticker"], "title": v["title"]}


def get_quarterly_revenue(cik: int, limit: int = 8) -> list[dict]:
    """Return up to `limit` most recent single-quarter revenue facts, each
    citing the real SEC filing it came from. Filters out cumulative
    (6-month/9-month YTD) entries that share the same XBRL tag."""
    padded = f"{int(cik):010d}"
    try:
        resp = requests.get(_FACTS_URL.format(cik=padded), headers=_HEADERS, timeout=15)
        if resp.status_code != 200:
            return []
        data = resp.json()
    except Exception:
        return []

    gaap = data.get("facts", {}).get("us-gaap", {})
    rev = (
        gaap.get("RevenueFromContractWithCustomerExcludingAssessedTax")
        or gaap.get("Revenues")
    )
    if not rev:
        return []

    quarters = []
    seen = set()
    for u in rev.get("units", {}).get("USD", []):
        start, end = u.get("start"), u.get("end")
        if not start or not end:
            continue
        try:
            span_days = (date.fromisoformat(end) - date.fromisoformat(start)).days
        except ValueError:
            continue
        if not (80 <= span_days <= 100):  # single quarter only — skip YTD cumulative
            continue
        key = (start, end)
        if key in seen:
            continue
        seen.add(key)

        accn = (u.get("accn") or "").replace("-", "")
        filing_url = (
            f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{accn}/"
            if accn else
            f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={int(cik)}&type=10-Q"
        )
        quarters.append({
            "start": start,
            "end": end,
            "revenue_usd": u.get("val"),
            "filed": u.get("filed"),
            "form": u.get("form"),
            "url": filing_url,
        })

    quarters.sort(key=lambda q: q["end"], reverse=True)
    return quarters[:limit]
