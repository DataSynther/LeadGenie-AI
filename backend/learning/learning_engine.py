import json
import os
from collections import Counter
from anthropic import Anthropic
from .feedback_collector import FeedbackCollector

client = Anthropic()
MODEL = os.getenv("CLAUDE_MODEL_LEARNING") or os.getenv("CLAUDE_MODEL", "claude-haiku-4-5-20251001")


class LearningEngine:
    """Analyzes feedback patterns and generates improved prompt guidance."""

    def __init__(self):
        self.collector = FeedbackCollector()

    def analyze_patterns(self) -> dict:
        """Summarize outcome distributions and surface winning patterns."""
        all_feedback = self.collector.get_all_feedback()
        outcome_counts = Counter(r["outcome"] for r in all_feedback)
        total = len(all_feedback)

        return {
            "total_interactions": total,
            "outcome_distribution": dict(outcome_counts),
            "meeting_rate": outcome_counts.get("meeting_booked", 0) / max(total, 1),
            "reply_rate": outcome_counts.get("replied", 0) / max(total, 1),
            "unsubscribe_rate": outcome_counts.get("unsubscribed", 0) / max(total, 1),
        }

    def get_optimized_guidance(self, context: dict) -> str:
        """Use Claude to synthesize feedback patterns into actionable prompt guidance."""
        patterns = self.analyze_patterns()
        successful = self.collector.get_successful_patterns()

        prompt = f"""
You are an AI SDR coach. Based on the following feedback patterns,
provide 3-5 specific guidance points to improve outreach effectiveness.

Outcome Stats:
{json.dumps(patterns, indent=2)}

Recent Successful Patterns (sample):
{json.dumps(successful[-5:], indent=2)}

Target Lead Context:
{json.dumps(context, indent=2)}

Provide actionable guidance as a bulleted list.
"""
        response = client.messages.create(
            model=MODEL,
            max_tokens=512,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.content[0].text

    def should_escalate(self) -> bool:
        """Flag if performance metrics have degraded and human review is needed."""
        patterns = self.analyze_patterns()
        return (
            patterns["unsubscribe_rate"] > 0.15
            or patterns["meeting_rate"] < 0.05
        )
