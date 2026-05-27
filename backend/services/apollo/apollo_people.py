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

        titles = [t.strip().lower() for t in filters.get("titles", []) if t.strip()]
        seniorities = [s.strip().lower() for s in filters.get("seniorities", []) if s.strip()]

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
            "seniority": raw.get("seniority"),
            "department": raw.get("department"),
            "email": raw.get("email"),
            "linkedin_url": raw.get("linkedin_url"),
            "organization_id": raw.get("organization_id"),
            "company": raw.get("company"),
        }

    # ── Live Apollo normalizer (for when real key is active) ─────────────────

    def _normalize_apollo(self, raw: dict) -> dict:
        return {
            "id": raw.get("id"),
            "name": raw.get("name"),
            "title": raw.get("title"),
            "seniority": raw.get("seniority"),
            "department": raw.get("departments", [None])[0],
            "email": raw.get("email"),
            "linkedin_url": raw.get("linkedin_url"),
            "organization_id": raw.get("organization_id"),
            "company": raw.get("organization", {}).get("name"),
        }
