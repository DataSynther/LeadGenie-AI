import json
import os
import re
from datetime import datetime
from pathlib import Path
from collections import defaultdict
from anthropic import Anthropic

from observability.agent_tracer import AgentTracer
from observability.validator import Validator
from observability.self_evaluator import self_evaluate, context_to_summary

client = Anthropic()
MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-6")

VALID_INTENTS = {"interested", "objection", "fact_question", "neutral", "meeting_request", "unsubscribe"}
ANALYTICS_FILE = Path(__file__).parent.parent.parent / "storage" / "intent_analytics" / "events.jsonl"
ANALYTICS_FILE.parent.mkdir(parents=True, exist_ok=True)


class IntentDetector:
    """Classifies inbound lead replies into actionable intent categories.

    Also persists every classification event to ANALYTICS_FILE for later analysis
    (intent counts, confidence trends, common trigger phrases by company segment).
    """

    def classify(self, reply: str, lead_id: str = None, context: dict = None) -> dict:
        """Classify intent and log the event for analytics."""
        prompt = f"""Classify this reply from a sales prospect into exactly one intent.

Reply: "{reply}"

Intent definitions:
- interested: genuine interest, wants to learn more, positive engagement
- objection: pushback, has a vendor, not now, too expensive, skeptical of value
- fact_question: asking a specific factual question about the product, service, or outcomes
- neutral: acknowledgment without clear direction (ok, thanks, noted, sure, got it)
- meeting_request: explicitly wants to schedule a call, demo, or meeting
- unsubscribe: wants to stop receiving messages, not interested at all

Respond with JSON only:
{{"intent": "<one of the above>", "confidence": <0.0-1.0>, "key_signal": "<2-4 words from reply that drove classification>", "reasoning": "<one sentence explaining why>"}}"""

        system = "You are a sales intent classifier. Always return valid JSON only."
        tracer = AgentTracer(agent="intent", lead_id=lead_id, context=context or {}, prompt_version="intent_v1")
        with tracer.trace(prompt=prompt, system=system) as t:
            response = client.messages.create(
                model=MODEL,
                max_tokens=150,
                system=system,
                messages=[{"role": "user", "content": prompt}],
            )
            text = response.content[0].text.strip()
            text = re.sub(r"^```(?:json)?\s*", "", text)
            text = re.sub(r"\s*```$", "", text)
            result = json.loads(text)
            if result.get("intent") not in VALID_INTENTS:
                result["intent"] = "neutral"
            t.finish(response, confidence=result.get("confidence"))
            t.set_self_eval(self_evaluate("intent", result.get("intent", ""), context_to_summary(context or {})))
            Validator("intent", lead_id=lead_id, context=context or {}).validate(result, tracker=t)

        self._log_event(reply, result, lead_id, context)
        return result

    def _log_event(self, reply: str, classification: dict, lead_id: str, context: dict) -> None:
        """Append one classification event to the JSONL analytics log."""
        ctx = context or {}
        company = ctx.get("company", {})
        research = ctx.get("research", {})
        event = {
            "timestamp": datetime.utcnow().isoformat(),
            "lead_id": lead_id,
            "reply_excerpt": reply[:200],
            "intent": classification.get("intent"),
            "confidence": classification.get("confidence"),
            "key_signal": classification.get("key_signal"),
            "reasoning": classification.get("reasoning"),
            "context_snapshot": {
                "company": company.get("name"),
                "industry": company.get("industry"),
                "growth_stage": research.get("growth_stage"),
                "ai_readiness_score": research.get("ai_readiness_score"),
                "pain_points_count": len(research.get("pain_points", [])),
                "scaling": ctx.get("signals", {}).get("scaling"),
            },
        }
        with open(ANALYTICS_FILE, "a") as f:
            f.write(json.dumps(event) + "\n")

    # ── Analytics helpers ─────────────────────────────────────────────────────

    @staticmethod
    def get_summary() -> dict:
        """Return aggregate intent counts, avg confidence, and top key signals per intent."""
        if not ANALYTICS_FILE.exists():
            return {"total_events": 0, "by_intent": {}}

        events = []
        with open(ANALYTICS_FILE) as f:
            for line in f:
                line = line.strip()
                if line:
                    events.append(json.loads(line))

        counts: dict = defaultdict(int)
        confidence_sum: dict = defaultdict(float)
        signals: dict = defaultdict(list)

        for e in events:
            intent = e.get("intent", "unknown")
            counts[intent] += 1
            if e.get("confidence") is not None:
                confidence_sum[intent] += e["confidence"]
            if e.get("key_signal"):
                signals[intent].append(e["key_signal"])

        by_intent = {}
        for intent in counts:
            n = counts[intent]
            top_signals = sorted(
                set(signals[intent]), key=lambda s: signals[intent].count(s), reverse=True
            )[:5]
            by_intent[intent] = {
                "count": n,
                "avg_confidence": round(confidence_sum[intent] / n, 3) if n else 0,
                "top_signals": top_signals,
            }

        return {"total_events": len(events), "by_intent": by_intent}

    @staticmethod
    def get_events(intent: str = None, lead_id: str = None) -> list[dict]:
        """Return filtered events from the analytics log."""
        if not ANALYTICS_FILE.exists():
            return []
        events = []
        with open(ANALYTICS_FILE) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                e = json.loads(line)
                if intent and e.get("intent") != intent:
                    continue
                if lead_id and e.get("lead_id") != lead_id:
                    continue
                events.append(e)
        return events
