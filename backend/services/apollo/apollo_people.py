import os
import requests
from typing import Optional

APOLLO_API_KEY = os.getenv("APOLLO_API_KEY")
APOLLO_BASE_URL = "https://api.apollo.io/v1"


class ApolloPeopleService:
    def __init__(self):
        self.headers = {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            "X-Api-Key": APOLLO_API_KEY,
        }

    def search_people(self, filters: dict) -> list[dict]:
        """Search for leads using Apollo /mixed_people/api_search."""
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
        return [self._normalize_person(p) for p in data.get("people", [])]

    def get_person_details(self, person_id: str) -> Optional[dict]:
        """Fetch enriched details for a single person by Apollo ID."""
        response = requests.get(
            f"{APOLLO_BASE_URL}/people/{person_id}",
            headers=self.headers,
        )
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return self._normalize_person(response.json().get("person", {}))

    def _normalize_person(self, raw: dict) -> dict:
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
