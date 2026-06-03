"""Cross-layer governance orchestrator with iterative auto-correction.

Runs all three governance layers (validator → tone → hallucination) in sequence.
If any layer fails, it builds a compound correction note targeting the specific
violations and re-runs the outreach agent — up to MAX_ATTEMPTS total.

Each attempt records exactly which layers failed and why, stored as
governance_attempt_history in the audit log and returned to callers.
"""
import logging
from typing import Optional

from observability.validator import Validator
from observability import diagnostic_store

logger = logging.getLogger(__name__)

MAX_ATTEMPTS = 3


class GovernanceOrchestrator:
    """Orchestrates outreach generation + all governance checks with cross-layer retry."""

    def __init__(self, tone_validator, hallucination_checker, risk_engine):
        self.tone_validator = tone_validator
        self.hallucination_checker = hallucination_checker
        self.risk_engine = risk_engine

    def run(
        self,
        outreach_agent,
        context: dict,
        top_trends: list,
        source_facts: dict,
        lead_id: Optional[str] = None,
    ) -> dict:
        """
        Full governed generation with cross-layer retry.

        Returns dict with:
          email, governance, governance_attempt_history
        """
        attempt_history = []
        email = {}
        correction_note: Optional[str] = None

        for attempt in range(1, MAX_ATTEMPTS + 1):
            # ── 1. Generate email (one attempt, with optional correction) ───────
            raw = outreach_agent.generate_single(context, top_trends, correction_note, attempt)

            # Pull observability fields injected by generate_single, then clean email
            prompt_used     = raw.pop("_prompt_used", "")
            correction_used = raw.pop("_correction_note", "")
            email = raw  # clean dict: {subject, body, reasoning, ...}

            # ── 2. Shape / context / policy validator ────────────────────────────
            val = Validator("outreach", lead_id=lead_id, context=context).validate(email)

            # ── 3. Tone check ─────────────────────────────────────────────────────
            tone = self.tone_validator.validate(email)

            # ── 4. Hallucination check ────────────────────────────────────────────
            hallucination = self.hallucination_checker.check(
                email.get("body", ""), source_facts
            )

            layer_results = {
                "validator": {
                    "consequence": val["consequence"],
                    "issues": val["issues"],
                    "checkpoints": val.get("checkpoints", {}),
                },
                "tone": {
                    "passed": tone["passed"],
                    "issues": tone["issues"],
                },
                "hallucination": {
                    "passed": hallucination.get("passed", True),
                    "violations": hallucination.get("violations", []),
                    "confidence": hallucination.get("confidence"),
                    "explanation": hallucination.get("explanation", ""),
                },
            }

            all_issues = (
                val["issues"]
                + tone["issues"]
                + hallucination.get("violations", [])
            )
            passed = not all_issues

            # For retry attempts show the tail of the prompt so the correction is visible;
            # for the first attempt show the head so the base instructions are visible.
            if attempt == 1 or not correction_used:
                preview = prompt_used[:800]
            else:
                # Show head (200) + tail (600) so both base context and correction are visible
                head = prompt_used[:200]
                tail = prompt_used[-600:] if len(prompt_used) > 800 else prompt_used[200:]
                preview = head + "\n…\n" + tail

            attempt_history.append({
                "attempt":         attempt,
                "passed":          passed,
                "prompt_preview":  preview,
                "correction_note": correction_used,
                "email": {
                    "subject":   email.get("subject", ""),
                    "body":      email.get("body", ""),
                    "reasoning": email.get("reasoning", ""),
                },
                "layers": layer_results,
            })

            logger.info(
                "Governance attempt %d/%d: passed=%s issues=%d",
                attempt, MAX_ATTEMPTS, passed, len(all_issues),
            )

            if passed:
                break

            if attempt < MAX_ATTEMPTS:
                correction_note = self._build_correction(layer_results, attempt)

        # ── 5. Final risk score (always on last email) ────────────────────────
        governance = self.risk_engine.evaluate(lead_id, email, source_facts)
        governance["governance_attempt_history"] = attempt_history
        governance["total_attempts"] = len(attempt_history)

        # ── 6. Persist full per-attempt record for PromptVersionsPage ─────────
        final_passed = attempt_history[-1].get("passed", True) if attempt_history else True
        try:
            diagnostic_store.write_governance_run(
                lead_id=lead_id,
                prompt_version="outreach_email_v1",
                agent="outreach",
                attempt_history=attempt_history,
                final_passed=final_passed,
                final_risk_score=governance.get("risk_score"),
                lead_name=(context.get("lead") or {}).get("name"),
                company_name=(context.get("company") or {}).get("name"),
            )
        except Exception as exc:
            logger.warning("write_governance_run failed: %s", exc)

        return {
            "email": email,
            "governance": governance,
            "governance_attempt_history": attempt_history,
        }

    # ── Correction builder ────────────────────────────────────────────────────

    def _build_correction(self, layers: dict, attempt: int) -> str:
        lines = [
            f"\n\n=== GOVERNANCE CORRECTION (Attempt {attempt + 1}/{MAX_ATTEMPTS}) ===",
            "The previous email FAILED governance. Fix every issue below before responding:",
        ]

        # Validator failures (shape / context / policy)
        val = layers.get("validator", {})
        for issue in val.get("issues", []):
            if issue.startswith("shape:missing_fields:"):
                fields = issue.replace("shape:missing_fields:", "")
                lines.append(f"  ✗ SHAPE: Missing JSON fields: {fields}. Include them.")
            elif issue.startswith("context:company_name_absent:"):
                name = issue.replace("context:company_name_absent:", "")
                lines.append(f"  ✗ CONTEXT: Company name '{name}' not mentioned in email. Reference it explicitly.")
            elif "response_too_short" in issue:
                lines.append("  ✗ CONTEXT: Response too short. Write a complete email body.")
            elif issue.startswith("policy:"):
                lines.append(f"  ✗ POLICY: {issue.replace('policy:', '')}. Revise to comply.")
            else:
                lines.append(f"  ✗ VALIDATOR: {issue}")

        # Tone failures
        for issue in layers.get("tone", {}).get("issues", []):
            if "Banned phrase" in issue:
                phrase = issue.split("'")[1] if "'" in issue else issue
                lines.append(f"  ✗ TONE: Remove banned phrase '{phrase}'.")
            elif "Subject too long" in issue:
                lines.append(f"  ✗ TONE: {issue}. Shorten subject line.")
            elif "Body too long" in issue:
                lines.append(f"  ✗ TONE: {issue}. Cut sentences to stay under the limit.")
            elif "exclamation" in issue.lower():
                lines.append("  ✗ TONE: Remove excessive exclamation marks.")
            else:
                lines.append(f"  ✗ TONE: {issue}")

        # Hallucination failures
        for violation in layers.get("hallucination", {}).get("violations", []):
            lines.append(f"  ✗ HALLUCINATION: {violation[:200]}")
            lines.append("    → Remove or rewrite this claim using only verified facts from the context.")

        lines.append("\nRegenerate the COMPLETE email JSON addressing every issue above.")
        return "\n".join(lines)
