"""Output validator: shape → context → policy → business rules → allow/block/defer."""
from typing import Optional

from observability.diagnostic_store import write_validation, CATEGORY_VALIDATION

# ── Required output shapes per agent ─────────────────────────────────────────

SHAPES: dict[str, list[str]] = {
    "outreach":           ["subject", "body"],
    "outreach_objection": ["response_text"],    # objection responses have a different shape
    "research":    ["summary", "growth_stage", "strategic_priorities", "likely_pain_points", "ai_readiness_score"],
    "intent":      ["intent", "confidence"],
    "conversation": [],          # free-form text — shape check is just non-empty
    "governance":  ["approved", "risk_score"],
}

# Intents that are NEVER auto-sent — always require human review
HIGH_REVIEW_INTENTS = {"unsubscribe", "objection"}

# Risk score above which governance outputs are deferred
GOVERNANCE_RISK_THRESHOLD = 0.7


class Validator:
    """Validate an agent's output before it is used or sent.

    Usage:
        result = Validator("outreach", lead_id, context).validate(output_dict, tracker=t)
        # result["consequence"] is "allow" | "block" | "defer"
    """

    def __init__(
        self,
        agent: str,
        lead_id: Optional[str] = None,
        context: Optional[dict] = None,
    ):
        self.agent = agent
        self.lead_id = lead_id
        self.context = context or {}

    def validate(self, output, tracker=None) -> dict:
        """Run all validation checks and write a validation record.

        Args:
            output: The agent's output (dict or str).
            tracker: Optional _TraceTracker from AgentTracer — marks validation_ran.

        Returns:
            dict with keys: shape_ok, context_ok, policy_ok, consequence, issues, output_preview
        """
        issues = []

        shape_ok   = self._check_shape(output, issues)
        context_ok = self._check_context(output, issues)
        policy_ok  = self._check_policy(output, issues)

        consequence = self._decide(shape_ok, context_ok, policy_ok)

        preview = self._preview(output)
        record = write_validation(
            agent=self.agent,
            lead_id=self.lead_id,
            shape_ok=shape_ok,
            context_ok=context_ok,
            policy_ok=policy_ok,
            consequence=consequence,
            issues=issues,
            output_preview=preview,
        )

        if tracker is not None:
            tracker.mark_validation_ran()

        return {**record, "consequence": consequence}

    # ── Checks ────────────────────────────────────────────────────────────────

    def _check_shape(self, output, issues: list) -> bool:
        required = SHAPES.get(self.agent, [])
        if not required:
            # free-form: just check non-empty
            ok = bool(output)
            if not ok:
                issues.append("shape:empty_output")
            return ok

        if not isinstance(output, dict):
            issues.append("shape:not_a_dict")
            return False

        missing = [f for f in required if not output.get(f)]
        if missing:
            issues.append(f"shape:missing_fields:{','.join(missing)}")
        return len(missing) == 0

    def _check_context(self, output, issues: list) -> bool:
        """Verify output makes sense relative to the provided context."""
        ctx = self.context
        company_name = (ctx.get("company") or {}).get("name", "")
        lead_name    = (ctx.get("lead") or {}).get("name", "")

        ok = True

        if isinstance(output, dict):
            body = output.get("body") or output.get("response") or output.get("summary") or ""
        else:
            body = str(output)

        # Flag if output is suspiciously short (< 20 chars) for agents that should produce real content
        if self.agent in ("outreach", "conversation") and len(body.strip()) < 20:
            issues.append("context:response_too_short")
            ok = False

        # Flag if company/lead name referenced in context is completely absent from outreach body
        if self.agent == "outreach" and company_name and company_name.lower() not in body.lower():
            issues.append(f"context:company_name_absent:{company_name}")
            ok = False

        return ok

    def _check_policy(self, output, issues: list) -> bool:
        """Policy and business-rule checks."""
        ok = True

        # Intent routing policy
        if self.agent == "intent":
            intent = output.get("intent") if isinstance(output, dict) else ""
            if intent in HIGH_REVIEW_INTENTS:
                issues.append(f"policy:high_review_intent:{intent}")
                ok = False  # will become defer

        # Governance risk threshold
        if self.agent == "governance" and isinstance(output, dict):
            risk = output.get("risk_score", 0)
            if risk >= GOVERNANCE_RISK_THRESHOLD:
                issues.append(f"policy:high_risk_score:{risk}")
                ok = False

        # Outreach: block if subject/body both empty (caught by shape but double-check)
        if self.agent == "outreach" and isinstance(output, dict):
            if not output.get("subject") and not output.get("body"):
                issues.append("policy:empty_email")
                ok = False

        return ok

    # ── Decision ──────────────────────────────────────────────────────────────

    def _decide(self, shape_ok: bool, context_ok: bool, policy_ok: bool) -> str:
        """
        block  — shape check failed (malformed output, never usable)
        defer  — context or policy check failed (needs human review)
        allow  — all checks passed
        """
        if not shape_ok:
            return "block"
        if not context_ok or not policy_ok:
            return "defer"
        return "allow"

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _preview(output) -> str:
        if isinstance(output, dict):
            body = output.get("body") or output.get("response") or output.get("summary") or str(output)
        else:
            body = str(output)
        return body[:300]
