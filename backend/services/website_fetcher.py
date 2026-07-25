"""Fetches and extracts readable text from a company's own website.

Best-effort only: arbitrary websites vary wildly (JS-rendered content,
anti-bot measures, paywalls) and this makes no attempt to defeat any of
that — it's a plain HTTP GET + tag-stripping, same as any crawler. Silent
failure (empty result) is expected and handled by callers, not an error.
"""
from __future__ import annotations

import requests
from bs4 import BeautifulSoup

_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; LeadGenieBot/1.0; +https://ganitinc.com)"}
_TIMEOUT_S = 10
_MAX_CHARS = 3000

# Tried in order after the homepage; first one that resolves is used.
_SECONDARY_PATHS = ["/about", "/about-us", "/newsroom", "/news", "/press"]


def _extract_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "noscript", "svg"]):
        tag.decompose()
    text = " ".join(soup.get_text(separator=" ").split())
    return text[:_MAX_CHARS]


def _fetch_page(url: str) -> str | None:
    try:
        resp = requests.get(url, headers=_HEADERS, timeout=_TIMEOUT_S)
        if resp.status_code != 200 or not resp.text:
            return None
        return _extract_text(resp.text)
    except Exception:
        return None


def fetch_company_pages(domain: str) -> list[dict]:
    """Fetch the homepage plus one secondary page (about/news/press).

    Returns a list of {url, text} for whichever pages actually resolved —
    can be empty if the site is unreachable or blocks plain HTTP fetches.
    """
    domain = domain.strip().lower()
    if not domain.startswith("http"):
        domain = f"https://{domain}"

    pages: list[dict] = []
    home_text = _fetch_page(domain)
    if home_text:
        pages.append({"url": domain, "text": home_text})

    for path in _SECONDARY_PATHS:
        text = _fetch_page(domain.rstrip("/") + path)
        if text:
            pages.append({"url": domain.rstrip("/") + path, "text": text})
            break

    return pages
