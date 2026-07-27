import json
import os
import requests
from pathlib import Path
from typing import Optional

from services.company_resolver import resolve_company

APOLLO_BASE_URL = "https://api.apollo.io/api/v1"
_SAMPLE_PATH = Path(__file__).parent.parent.parent.parent / "sample_data" / "demo_companies.json"


class ApolloCompanyService:
    def __init__(self):
        self.headers = {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            "X-Api-Key": os.getenv("APOLLO_API_KEY"),
        }
        self._sample: list[dict] | None = None

    def _load_sample(self) -> list[dict]:
        if self._sample is None:
            try:
                self._sample = json.loads(_SAMPLE_PATH.read_text())
            except Exception:
                self._sample = []
        return self._sample

    def _search_sample(self, domain: str) -> Optional[dict]:
        domain_lower = domain.lower()
        for company in self._load_sample():
            if (company.get("domain") or "").lower() == domain_lower:
                return company
        return None

    def enrich_company(self, domain: str) -> Optional[dict]:
        """Enrich company — uses cached demo data when APOLLO_DEMO_MODE=true or no
        API key, then falls back to a keyless public-website lookup for any
        company outside our demo/Apollo data (see services/company_resolver.py)."""
        if os.getenv("APOLLO_DEMO_MODE", "true").lower() == "true" or not self.headers.get("X-Api-Key"):
            return self._search_sample(domain) or resolve_company(domain)
        try:
            response = requests.get(
                f"{APOLLO_BASE_URL}/organizations/enrich",
                headers=self.headers,
                params={"domain": domain},
                timeout=10,
            )
            if response.status_code == 404:
                return self._search_sample(domain) or resolve_company(domain)
            response.raise_for_status()
            return self._normalize_company(response.json().get("organization", {}))
        except Exception:
            return self._search_sample(domain) or resolve_company(domain)

    def get_company_by_id(self, org_id: str) -> Optional[dict]:
        """Fetch company by Apollo org ID — falls back to sample on any error."""
        try:
            response = requests.get(
                f"{APOLLO_BASE_URL}/organizations/{org_id}",
                headers=self.headers,
                timeout=10,
            )
            if response.status_code == 404:
                return None
            response.raise_for_status()
            return self._normalize_company(response.json().get("organization", {}))
        except Exception:
            return None

    def _normalize_company(self, raw: dict) -> dict:
        growth_raw = raw.get("organization_headcount_twelve_month_growth")
        return {
            "id": raw.get("id"),
            "name": raw.get("name"),
            "domain": raw.get("primary_domain"),
            "industry": raw.get("industry"),
            "employee_count": raw.get("estimated_num_employees"),
            "revenue": raw.get("annual_revenue_printed"),
            "funding_stage": raw.get("latest_funding_stage"),
            "technologies": raw.get("technology_names", []),
            "description": raw.get("short_description"),
            "linkedin_url": raw.get("linkedin_url"),
            "founded_year": raw.get("founded_year"),
            "city": raw.get("city"),
            "country": raw.get("country"),
            "headcount_growth_12m": (
                f"{round(growth_raw * 100, 1)}%" if growth_raw else None
            ),
        }
