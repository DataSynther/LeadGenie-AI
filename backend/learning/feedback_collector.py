import json
from datetime import datetime

from storage.base import storage_root

FEEDBACK_DIR = storage_root() / "feedback"
FEEDBACK_DIR.mkdir(parents=True, exist_ok=True)


OUTCOME_TYPES = {"meeting_booked", "replied", "no_reply", "unsubscribed", "objection", "approved", "rejected"}


class FeedbackCollector:
    """Records interaction outcomes to feed the continuous learning engine."""

    def record_outcome(self, lead_id: str, outcome: str, metadata: dict = None) -> None:
        """Record the outcome of an outreach interaction."""
        if outcome not in OUTCOME_TYPES:
            raise ValueError(f"Unknown outcome '{outcome}'. Must be one of {OUTCOME_TYPES}")

        record = {
            "lead_id": lead_id,
            "outcome": outcome,
            "metadata": metadata or {},
            "timestamp": datetime.utcnow().isoformat(),
        }
        path = FEEDBACK_DIR / "outcomes.jsonl"
        with open(path, "a") as f:
            f.write(json.dumps(record) + "\n")

    def get_all_feedback(self) -> list[dict]:
        path = FEEDBACK_DIR / "outcomes.jsonl"
        if not path.exists():
            return []
        with open(path) as f:
            return [json.loads(line) for line in f if line.strip()]

    def get_successful_patterns(self) -> list[dict]:
        """Return feedback records that resulted in positive outcomes."""
        positive = {"meeting_booked", "replied", "approved"}
        return [r for r in self.get_all_feedback() if r["outcome"] in positive]
