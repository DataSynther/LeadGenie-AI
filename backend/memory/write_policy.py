"""Write policy: what gets stored, which layer, at what granularity.

Rule: Write conservatively, retrieve aggressively.
Only store high-business-value facts (relevance >= 0.7).
Never store pure noise: greetings, one-word acknowledgements.
"""

from __future__ import annotations
import re

_NOISE_PATTERNS = [
    r"^(hi|hello|hey|sup)\b\.?$",
    r"^(thanks|thank you|thx|ty)\b\.?$",
    r"^(sounds good|noted|got it|understood|ok|okay|sure|great|perfect|cool|nice|yep|nope|yes|no)\s*[.!]?$",
    r"^(will do|on it|roger that)\s*[.!]?$",
]

# business-value keyword groups
_BV_HIGH = [
    "data pipeline", "compliance", "governance", "migration", "hiring", "layoff",
    "funding", "acquisition", "series", "ipo", "product launch", "snowflake",
    "databricks", "dbt", "airbyte", "kafka", "airflow", "machine learning", "llm",
    "automation", "integration", "scalability", "vendor", "budget", "pricing",
    "contract", "security", "privacy", "gdpr", "soc2",
    # additional domain terms for ETL / data stack pain points
    "pipeline", "etl", "elt", "warehouse", "lakehouse", "orchestration",
    "real-time", "streaming", "batch", "latency", "reliability", "downtime",
]
_BV_MED = [
    "interested", "objection", "meeting", "demo", "timeline", "decision",
    "team size", "head count", "approved", "blocked", "concern",
    "legacy", "unreliable", "bottleneck", "pain point", "challenge",
    "outage", "incident", "slow", "cost", "expensive", "inefficient",
]
_BV_LOW = ["question", "information", "learn more", "curious", "consider"]

MIN_LENGTH = 10

# Different thresholds by memory type — episodic just avoids noise,
# semantic/entity require high business relevance (only durable facts)
_THRESHOLDS = {
    "episodic":   0.55,
    "short_term": 0.50,
    "semantic":   0.68,
    "entity":     0.68,
}


class WritePolicy:
    """Governs whether a piece of content should be written to memory."""

    def evaluate(self, content: str, memory_type: str) -> dict:
        """
        Returns:
            allowed (bool)
            reason  (str): 'approved' | 'too_short' | 'low_value_noise' | 'below_relevance_threshold'
            relevance_score (float 0–1)
        """
        stripped = content.strip()
        threshold = _THRESHOLDS.get(memory_type, 0.65)

        if len(stripped) < MIN_LENGTH:
            return {"allowed": False, "reason": "too_short", "relevance_score": 0.0}

        if self._is_noise(stripped):
            return {"allowed": False, "reason": "low_value_noise", "relevance_score": 0.05}

        score = self._score(stripped, memory_type)
        if score < threshold:
            return {"allowed": False, "reason": "below_relevance_threshold", "relevance_score": round(score, 3)}

        return {"allowed": True, "reason": "approved", "relevance_score": round(score, 3)}

    # ── internals ──────────────────────────────────────────────────────────────

    def _is_noise(self, content: str) -> bool:
        c = content.lower()
        return any(re.fullmatch(p, c) for p in _NOISE_PATTERNS)

    def _score(self, content: str, memory_type: str) -> float:
        c = content.lower()
        score = 0.45  # base

        for kw in _BV_HIGH:
            if kw in c:
                score += 0.12
        for kw in _BV_MED:
            if kw in c:
                score += 0.06
        for kw in _BV_LOW:
            if kw in c:
                score += 0.03

        # memory type multiplier
        multipliers = {"semantic": 1.0, "entity": 0.95, "episodic": 0.85, "short_term": 0.80}
        score *= multipliers.get(memory_type, 0.80)

        return min(score, 1.0)
