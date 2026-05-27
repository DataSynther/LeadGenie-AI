import os
import requests
from typing import Optional

APOLLO_BASE_URL = "https://api.apollo.io/api/v1"


class ApolloCompanyService:
    def __init__(self):
        self.headers = {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            "X-Api-Key": os.getenv("APOLLO_API_KEY"),
        }

    def enrich_company(self, domain: str) -> Optional[dict]:
        """Enrich company data from Apollo /organizations/enrich by domain."""
        response = requests.get(
            f"{APOLLO_BASE_URL}/organizations/enrich",
            headers=self.headers,
            params={"domain": domain},
        )
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return self._normalize_company(response.json().get("organization", {}))

    def get_company_by_id(self, org_id: str) -> Optional[dict]:
        """Fetch company details by Apollo organization ID."""
        response = requests.get(
            f"{APOLLO_BASE_URL}/organizations/{org_id}",
            headers=self.headers,
        )
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return self._normalize_company(response.json().get("organization", {}))

    def _normalize_company(self, raw: dict) -> dict:
        return {
            "id": raw.get("id"),
            "name": raw.get("name"),
            "domain": raw.get("primary_domain"),
            "industry": raw.get("industry"),
            "employee_count": raw.get("estimated_num_employees"),
            "revenue_estimate": raw.get("annual_revenue"),
            "funding_stage": raw.get("latest_funding_stage"),
            "technologies": raw.get("technology_names", []),
            "description": raw.get("short_description"),
            "headquarters": raw.get("primary_phone", {}).get("country"),
            "linkedin_url": raw.get("linkedin_url"),
        }
