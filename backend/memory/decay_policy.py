"""Decay policy: every memory item has a lifecycle.

Stale memory is wrong memory — aging is a correctness mechanism, not a cleanup task.
Uses half-life decay: effective_score = confidence × rate^(age_days / 30)
"""

from __future__ import annotations
from datetime import datetime, timezone

# Fraction of confidence retained per 30-day period
DECAY_RATES: dict[str, float] = {
    "preference":      0.90,   # slow — preferences change infrequently
    "objection":       0.75,   # medium — objections can be overcome
    "meeting_request": 0.50,   # fast — stale if not acted on quickly
    "signal":          0.30,   # very fast — hiring/funding signals expire
    "trend":           0.40,   # fast — AI hiring signal TTL ~30 days
    "fact":            0.85,   # slow — factual claims decay but slowly
    "entity":          0.92,   # very slow — entity facts are durable
    "episodic":        0.80,   # medium — conversation context decays
}

STALE_THRESHOLD  = 0.30
EXPIRE_THRESHOLD = 0.15


class DecayPolicy:
    def effective_score(self, memory: dict) -> float:
        """Confidence × decay based on age. Returns 0–1."""
        confidence = float(memory.get("confidence", 0.9))
        ts_str = (
            memory.get("asserted_at")
            or memory.get("created_at")
            or memory.get("ts")
            or memory.get("timestamp")
        )
        if not ts_str:
            return confidence

        try:
            ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
            age_days = max((datetime.now(timezone.utc) - ts).days, 0)
        except (ValueError, AttributeError):
            return confidence

        fact_type = memory.get("fact_type") or memory.get("memory_type", "fact")
        rate = DECAY_RATES.get(fact_type, 0.85)
        decay = rate ** (age_days / 30)
        return round(confidence * decay, 4)

    def is_stale(self, memory: dict) -> bool:
        return self.effective_score(memory) < STALE_THRESHOLD

    def should_expire(self, memory: dict) -> bool:
        return self.effective_score(memory) < EXPIRE_THRESHOLD

    def scan(self, memories: list[dict]) -> dict:
        """Classify each memory as expired / stale / healthy."""
        expired, stale, healthy = [], [], []
        for m in memories:
            score = self.effective_score(m)
            if score < EXPIRE_THRESHOLD:
                expired.append({**m, "_effective_score": score})
            elif score < STALE_THRESHOLD:
                stale.append({**m, "_effective_score": score})
            else:
                healthy.append({**m, "_effective_score": score})
        return {"expired": expired, "stale": stale, "healthy": healthy}
