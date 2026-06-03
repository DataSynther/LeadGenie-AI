import os
import json
import requests
from pathlib import Path
from typing import Optional

APOLLO_BASE_URL = "https://api.apollo.io/api/v1"

_SAMPLE_PATH    = Path(__file__).parent.parent.parent.parent / "sample_data" / "demo_leads.json"
_COMPANIES_PATH = Path(__file__).parent.parent.parent.parent / "sample_data" / "demo_companies.json"


def _load_sample() -> list[dict]:
    try:
        with open(_SAMPLE_PATH, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def _load_companies() -> dict[str, dict]:
    """Return {company_name_lower: company_record} for fast lookup."""
    try:
        with open(_COMPANIES_PATH, encoding="utf-8") as f:
            companies = json.load(f)
        return {c["name"].lower(): c for c in companies}
    except Exception:
        return {}


# Loaded once at startup
_SAMPLE_LEADS:    list[dict]       = _load_sample()
_COMPANY_LOOKUP:  dict[str, dict]  = _load_companies()

# All sample companies are India-based
_SAMPLE_COUNTRY = "india"


class ApolloPeopleService:
    def __init__(self):
        self._api_key = os.getenv("APOLLO_API_KEY")
        self.headers = {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            "X-Api-Key": self._api_key,
        }

    def _use_sample(self) -> bool:
        return True  # MVP: always use sample data

    def search_people(self, filters: dict) -> list[dict]:
        if self._use_sample():
            return self._search_sample(filters)

        payload = {
            "q_organization_domains":       filters.get("domains", []),
            "person_titles":                filters.get("titles", []),
            "person_seniorities":           filters.get("seniorities", []),
            "organization_industry_tag_ids": filters.get("industries", []),
            "person_locations":             filters.get("locations", []),
            "page":     filters.get("page", 1),
            "per_page": filters.get("per_page", 25),
        }
        response = requests.post(
            f"{APOLLO_BASE_URL}/mixed_people/api_search",
            headers=self.headers,
            json=payload,
        )
        response.raise_for_status()
        data = response.json()
        return [self._normalize_apollo(p) for p in data.get("people", [])]

    def get_person_details(self, person_id: str) -> Optional[dict]:
        if self._use_sample():
            match = next((p for p in _SAMPLE_LEADS if p["id"] == person_id), None)
            return self._normalize_sample(match) if match else None

        response = requests.get(
            f"{APOLLO_BASE_URL}/people/{person_id}",
            headers=self.headers,
        )
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return self._normalize_apollo(response.json().get("person", {}))

    # ── Sample data helpers ──────────────────────────────────────────────────

    def _get_company_industry(self, company_name: str) -> str:
        """Look up a lead's company industry via demo_companies.json."""
        return _COMPANY_LOOKUP.get(company_name.lower(), {}).get("industry", "")

    def _search_sample(self, filters: dict) -> list[dict]:
        results = list(_SAMPLE_LEADS)

        company_names = [c.strip().lower() for c in filters.get("company_names", []) if c.strip()]
        titles        = [t.strip().lower() for t in filters.get("titles", []) if t.strip()]
        seniorities   = [s.strip().lower() for s in filters.get("seniorities", []) if s.strip()]
        # industry keywords sent from the frontend (e.g. "technology", "health")
        industries    = [i.strip().lower() for i in filters.get("industries", []) if i.strip()]
        # location strings (e.g. "India", "USA")
        locations     = [l.strip().lower() for l in filters.get("locations", []) if l.strip()]

        if company_names:
            results = [
                p for p in results
                if any(c in p.get("company", "").lower() for c in company_names)
            ]
        if titles:
            results = [
                p for p in results
                if any(t in p.get("title", "").lower() for t in titles)
            ]
        if seniorities:
            results = [
                p for p in results
                if p.get("seniority", "").lower() in seniorities
            ]
        if industries:
            # Substring-match the selected keyword against the company's industry string
            results = [
                p for p in results
                if any(
                    ind in self._get_company_industry(p.get("company", ""))
                    for ind in industries
                )
            ]
        if locations:
            # All sample leads are India-based; any non-India location yields no results
            results = [
                p for p in results
                if any(loc in _SAMPLE_COUNTRY for loc in locations)
            ]

        per_page = filters.get("per_page", 25)
        return [self._normalize_sample(p) for p in results[:per_page]]

    def _normalize_sample(self, raw: dict) -> dict:
        return {
            "id":              raw.get("id"),
            "name":            raw.get("name"),
            "title":           raw.get("title"),
            "seniority":       raw.get("seniority"),
            "department":      raw.get("department"),
            "email":           raw.get("email"),
            "linkedin_url":    raw.get("linkedin_url"),
            "organization_id": raw.get("organization_id"),
            "company":         raw.get("company"),
        }

    # ── Live Apollo normalizer ───────────────────────────────────────────────

    def _normalize_apollo(self, raw: dict) -> dict:
        return {
            "id":              raw.get("id"),
            "name":            raw.get("name"),
            "title":           raw.get("title"),
            "seniority":       raw.get("seniority"),
            "department":      raw.get("departments", [None])[0],
            "email":           raw.get("email"),
            "linkedin_url":    raw.get("linkedin_url"),
            "organization_id": raw.get("organization_id"),
            "company":         raw.get("organization", {}).get("name"),
        }
