from .hallucination_checker import HallucinationChecker
from .tone_validator import ToneValidator
from .audit_logger import AuditLogger


class RiskEngine:
    """Orchestrates all governance checks and produces a final risk score."""

    def __init__(self):
        self.hallucination_checker = HallucinationChecker()
        self.tone_validator = ToneValidator()
        self.audit_logger = AuditLogger()

    def evaluate(self, lead_id: str, content: dict, source_facts: dict) -> dict:
        """
        Run all governance checks on generated content.
        Returns: {approved: bool, risk_score: float, issues: list, event_id: str}
        """
        tone_result = self.tone_validator.validate(content)
        hallucination_result = self.hallucination_checker.check(
            content.get("body", ""), source_facts
        )

        issues = tone_result["issues"] + hallucination_result.get("violations", [])
        risk_score = self._compute_risk_score(tone_result, hallucination_result)
        approved = risk_score < 0.4 and tone_result["passed"] and hallucination_result.get("passed", True)

        event_id = self.audit_logger.log_event(
            event_type="outreach_governance_check",
            lead_id=lead_id,
            payload={
                "content": content,
                "tone_result": tone_result,
                "hallucination_result": hallucination_result,
                "risk_score": risk_score,
                "issues": issues,
            },
            decision="approved" if approved else "flagged",
        )

        return {
            "approved": approved,
            "risk_score": risk_score,
            "issues": issues,
            "event_id": event_id,
            "requires_human_review": not approved,
        }

    def _compute_risk_score(self, tone: dict, hallucination: dict) -> float:
        score = 0.0
        score += len(tone["issues"]) * 0.1
        if not hallucination.get("passed", True):
            score += 0.5
        score += (1.0 - hallucination.get("confidence", 1.0)) * 0.2
        return min(score, 1.0)
