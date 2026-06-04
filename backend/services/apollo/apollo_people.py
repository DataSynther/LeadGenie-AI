import os
import json
import requests
from pathlib import Path
from typing import Optional

APOLLO_BASE_URL = "https://api.apollo.io/api/v1"

_SAMPLE_PATH = Path(__file__).parent.parent.parent.parent / "sample_data" / "demo_leads.json"


def _load_sample() -> list[dict]:
    try:
        with open(_SAMPLE_PATH, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


# Loaded once at startup
_SAMPLE_LEADS: list[dict] = _load_sample()


class ApolloPeopleService:
    def __init__(self):
        self._api_key = os.getenv("APOLLO_API_KEY")
        self.headers = {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            "X-Api-Key": self._api_key,
        }

    # Toggle this to switch between sample data and live Apollo
    def _use_sample(self) -> bool:
        return True  # MVP: always use sample data

    def search_people(self, filters: dict) -> list[dict]:
        if self._use_sample():
            return self._search_sample(filters)

        payload = {
            "q_organization_domains": filters.get("domains", []),
            "person_titles": filters.get("titles", []),
            "person_seniorities": filters.get("seniorities", []),
            "page": filters.get("page", 1),
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

    def _search_sample(self, filters: dict) -> list[dict]:
        results = list(_SAMPLE_LEADS)

        company_names = [c.strip().lower() for c in filters.get("company_names", []) if c.strip()]
        titles = [t.strip().lower() for t in filters.get("titles", []) if t.strip()]
        seniorities = [s.strip().lower() for s in filters.get("seniorities", []) if s.strip()]

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

        per_page = filters.get("per_page", 25)
        return [self._normalize_sample(p) for p in results[:per_page]]

    def _normalize_sample(self, raw: dict) -> dict:
        return {
            "id": raw.get("id"),
            "name": raw.get("name"),
            "title": raw.get("title"),
            "headline": raw.get("headline"),
            "seniority": raw.get("seniority"),
            "department": raw.get("department"),
            "email": raw.get("email"),
            "linkedin_url": raw.get("linkedin_url"),
            "organization_id": raw.get("organization_id"),
            "company": raw.get("company"),
            "city": raw.get("city"),
            "country": raw.get("country"),
            "phone": raw.get("phone"),
        }

    def enrich_by_name(self, name: str, org_name: str) -> Optional[dict]:
        """Live enrichment via /people/match — called at outreach-generation time."""
        parts = name.strip().split(" ", 1)
        first = parts[0]
        last = parts[1] if len(parts) > 1 else ""
        try:
            response = requests.post(
                f"{APOLLO_BASE_URL}/people/match",
                headers=self.headers,
                json={"first_name": first, "last_name": last, "organization_name": org_name},
                timeout=10,
            )
            if response.status_code == 200:
                person = response.json().get("person")
                if person:
                    return self._normalize_apollo(person)
        except Exception:
            pass
        return None

    # ── Live Apollo normalizer (for when real key is active) ─────────────────

    def _normalize_apollo(self, raw: dict) -> dict:
        org = raw.get("organization") or {}
        emp_history = raw.get("employment_history") or []
        recent_jobs = [
            {
                "title": j.get("title"),
                "company": j.get("organization_name"),
                "current": j.get("current", False),
            }
            for j in emp_history[:3]
        ]
        return {
            "id": raw.get("id"),
            "name": raw.get("name"),
            "title": raw.get("title"),
            "headline": raw.get("headline"),
            "seniority": raw.get("seniority"),
            "department": (raw.get("departments") or [None])[0],
            "departments": raw.get("departments", []),
            "email": raw.get("email"),
            "email_status": raw.get("email_status"),
            "linkedin_url": raw.get("linkedin_url"),
            "photo_url": raw.get("photo_url"),
            "city": raw.get("city"),
            "country": raw.get("country"),
            "organization_id": raw.get("organization_id"),
            "company": org.get("name") or raw.get("organization", {}).get("name"),
            "employment_history": recent_jobs,
            "org_tech_stack": [
                t.get("name") for t in (org.get("current_technologies") or [])[:8]
            ],
            "org_headcount_growth_12m": org.get("organization_headcount_twelve_month_growth"),
            "org_revenue": org.get("annual_revenue_printed"),
            "org_keywords": (org.get("keywords") or [])[:6],
            "org_description": org.get("short_description"),
            "org_employees": org.get("estimated_num_employees"),
            "org_industry": org.get("industry"),
        }
