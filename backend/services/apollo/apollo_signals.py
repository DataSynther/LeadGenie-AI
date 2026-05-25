import os
import requests
from collections import Counter

APOLLO_API_KEY = os.getenv("APOLLO_API_KEY")
APOLLO_BASE_URL = "https://api.apollo.io/v1"

AI_KEYWORDS = {"machine learning", "ai", "llm", "data science", "mlops", "nlp", "deep learning"}
ENGINEERING_KEYWORDS = {"software engineer", "backend", "frontend", "platform", "infrastructure", "devops"}


class ApolloSignalsService:
    def __init__(self):
        self.headers = {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            "X-Api-Key": APOLLO_API_KEY,
        }

    def get_job_postings(self, org_id: str) -> list[dict]:
        """Fetch active job postings for an organization."""
        response = requests.get(
            f"{APOLLO_BASE_URL}/organizations/{org_id}/job_postings",
            headers=self.headers,
        )
        response.raise_for_status()
        return response.json().get("job_postings", [])

    def detect_hiring_trends(self, org_id: str) -> dict:
        """Analyze job postings to surface hiring signals."""
        postings = self.get_job_postings(org_id)
        titles = [p.get("title", "").lower() for p in postings]

        ai_count = sum(
            1 for t in titles if any(kw in t for kw in AI_KEYWORDS)
        )
        eng_count = sum(
            1 for t in titles if any(kw in t for kw in ENGINEERING_KEYWORDS)
        )
        dept_counts = Counter(p.get("department", "unknown") for p in postings)

        return {
            "total_open_roles": len(postings),
            "ai_hiring": ai_count,
            "engineering_expansion": eng_count,
            "department_breakdown": dict(dept_counts),
            "scaling_signal": len(postings) > 20,
            "ai_signal": ai_count >= 3,
        }
