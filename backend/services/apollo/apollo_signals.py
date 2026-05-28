AI_TECH_KEYWORDS = {
    "ai", "machine learning", "llm", "data science", "mlops",
    "nlp", "deep learning", "anthropic claude", "openai", "tensorflow",
    "pytorch", "scikit-learn", "hugging face", "vertex ai", "sagemaker",
}

ENGINEERING_TECH_KEYWORDS = {
    "kubernetes", "docker", "aws", "google cloud", "azure", "terraform",
    "apache kafka", "spark", "airflow", "databricks", "snowflake",
    "postgresql", "mongodb", "redis", "elasticsearch",
}


class ApolloSignalsService:
    """
    Derives hiring and growth signals from enriched company data.
    Uses headcount growth rates and tech stack since Apollo job postings
    require a higher API plan tier.
    """

    def detect_hiring_trends(self, org_id: str, company: dict = None) -> dict:
        if not company:
            return self._empty_signals()

        tech_stack = [t.lower() for t in company.get("technologies", [])]
        growth_6m = company.get("headcount_growth_6m") or 0.0
        growth_12m = company.get("headcount_growth_12m") or 0.0
        employee_count = company.get("employee_count") or 0

        ai_tech_count = sum(1 for t in tech_stack if any(kw in t for kw in AI_TECH_KEYWORDS))
        eng_tech_count = sum(1 for t in tech_stack if any(kw in t for kw in ENGINEERING_TECH_KEYWORDS))

        estimated_new_hires_6m = int(employee_count * max(growth_6m, 0))
        scaling_signal = growth_6m > 0.08 or growth_12m > 0.15

        return {
            "total_open_roles": estimated_new_hires_6m,
            "ai_hiring": ai_tech_count,
            "engineering_expansion": eng_tech_count,
            "headcount_growth_6m": round(growth_6m * 100, 1),
            "headcount_growth_12m": round(growth_12m * 100, 1),
            "scaling_signal": scaling_signal,
            "ai_signal": ai_tech_count >= 2,
        }

    def _empty_signals(self) -> dict:
        return {
            "total_open_roles": 0,
            "ai_hiring": 0,
            "engineering_expansion": 0,
            "headcount_growth_6m": 0.0,
            "headcount_growth_12m": 0.0,
            "scaling_signal": False,
            "ai_signal": False,
        }
