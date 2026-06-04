"""Cross-layer governance orchestrator with iterative auto-correction.

Generation flow per run:
  1. Pre-generation context check  — rule-based, free. Aborts if lead/company data
     is too sparse to generate without hallucination risk.
  2. Retry loop (validator + tone only). Shape-only failures use a cheap fix-up
     prompt instead of full regeneration.
  3. Single hallucination check on the final output, outside the retry loop.
     Failed intermediate attempts never pay for a hallucination check.

Human review:
  Every generated email reaches the approval queue regardless of outcome.
  If hallucination violations are detected the human sees them and can manually
  edit the email, then re-run the check (costs one credit per re-check).
"""
import logging
from typing import Optional

from observability.validator import Validator
from observability import diagnostic_store
from agents.conversation.memory_manager import GroundingMemory

logger = logging.getLogger(__name__)

_grounding = GroundingMemory()

MAX_ATTEMPTS = 3


class GovernanceOrchestrator:
    """Orchestrates outreach generation + governance checks with cross-layer retry."""

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
        Full governed generation.

        Returns dict with:
          email, governance, governance_attempt_history
        """
        attempt_history = []
        email: dict = {}
        correction_note: Optional[str] = None
        use_fix_shape = False
        shape_missing_fields: list = []

        # ── Write grounding facts before any generation ──────────────────────
        if lead_id:
            try:
                _grounding.write(lead_id, context, top_trends)
            except Exception as exc:
                logger.warning("grounding.write failed: %s", exc)

        # ── 1. Pre-generation context completeness check (free, no Claude) ───
        context_check = self._check_context_completeness(context)
        if not context_check["sufficient"]:
            missing = context_check["missing_fields"]
            logger.warning(
                "Insufficient context for lead %s — skipping generation: missing=%s",
                lead_id, missing,
            )
            placeholder_email = {
                "subject": "[Needs enrichment — insufficient lead data]",
                "body": (
                    "This email could not be generated because the following required "
                    f"data is missing: {', '.join(missing)}. "
                    "Please enrich the lead profile and re-run."
                ),
                "reasoning": (
                    "Pre-generation context check failed — insufficient lead or "
                    "company data to generate without hallucination risk."
                ),
            }
            governance = self.risk_engine.evaluate(lead_id, placeholder_email, source_facts)
            governance["governance_attempt_history"] = []
            governance["total_attempts"] = 0
            governance["context_sufficient"] = False
            governance["context_missing_fields"] = missing
            return {
                "email": placeholder_email,
                "governance": governance,
                "governance_attempt_history": [],
            }

        # ── 2. Retry loop — validator + tone only, NO hallucination inside ───
        for attempt in range(1, MAX_ATTEMPTS + 1):
            if attempt > 1 and use_fix_shape and email:
                raw = outreach_agent.fix_shape(email, shape_missing_fields, attempt)
            else:
                raw = outreach_agent.generate_single(
                    context, top_trends, correction_note, attempt
                )

            prompt_used     = raw.pop("_prompt_used", "")
            correction_used = raw.pop("_correction_note", "")
            email = raw

            # Shape / context / policy
            val  = Validator("outreach", lead_id=lead_id, context=context).validate(email)
            # Tone
            tone = self.tone_validator.validate(email)

            all_issues = val["issues"] + tone["issues"]
            passed_without_halluc = not all_issues

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
                # Hallucination is run once after the loop — placeholder here
                "hallucination": {"passed": True, "violations": [], "skipped": True},
            }

            if attempt == 1 or not correction_used:
                preview = prompt_used[:800]
            else:
                head = prompt_used[:200]
                tail = prompt_used[-600:] if len(prompt_used) > 800 else prompt_used[200:]
                preview = head + "\n…\n" + tail

            attempt_history.append({
                "attempt":         attempt,
                "passed":          passed_without_halluc,
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
                attempt, MAX_ATTEMPTS, passed_without_halluc, len(all_issues),
            )

            if passed_without_halluc:
                break

            if attempt < MAX_ATTEMPTS:
                # Shape-only failure → use cheap fix-up prompt next attempt
                shape_issues = [i for i in val["issues"] if i.startswith("shape:")]
                shape_only = (
                    shape_issues
                    and len(shape_issues) == len(val["issues"])
                    and not tone["issues"]
                )
                if shape_only:
                    use_fix_shape = True
                    shape_missing_fields = []
                    for iss in shape_issues:
                        if iss.startswith("shape:missing_fields:"):
                            fields_part = iss.replace("shape:missing_fields:", "")
                            shape_missing_fields.extend(
                                f.strip() for f in fields_part.split(",")
                            )
                    correction_note = None
                else:
                    use_fix_shape = False
                    correction_note = self._build_correction(layer_results, attempt)

        # ── 3. Single hallucination check on final output ────────────────────
        hallucination = self.hallucination_checker.check(
            email.get("body", ""), source_facts, lead_id=lead_id
        )
        halluc_layer = {
            "passed":      hallucination.get("passed", True),
            "violations":  hallucination.get("violations", []),
            "confidence":  hallucination.get("confidence"),
            "explanation": hallucination.get("explanation", ""),
        }
        if attempt_history:
            attempt_history[-1]["layers"]["hallucination"] = halluc_layer
            # Overall pass includes hallucination
            halluc_ok = hallucination.get("passed", True)
            attempt_history[-1]["passed"] = attempt_history[-1]["passed"] and halluc_ok

        # ── 4. Risk score ─────────────────────────────────────────────────────
        governance = self.risk_engine.evaluate(lead_id, email, source_facts)
        governance["governance_attempt_history"] = attempt_history
        governance["total_attempts"] = len(attempt_history)
        governance["context_sufficient"] = True

        # ── 5. Persist governance run for PromptVersionsPage ─────────────────
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
            "email":                      email,
            "governance":                 governance,
            "governance_attempt_history": attempt_history,
        }

    # ── Context completeness check ────────────────────────────────────────────

    def _check_context_completeness(self, context: dict) -> dict:
        """Rule-based: does context have enough data to avoid hallucination risk?

        Aborts generation if 2+ critical fields are absent — no Claude call needed.
        """
        lead    = context.get("lead")    or {}
        company = context.get("company") or {}
        missing = []
        if not lead.get("name"):
            missing.append("lead.name")
        if not lead.get("title"):
            missing.append("lead.title")
        if not company.get("name"):
            missing.append("company.name")
        if not company.get("industry"):
            missing.append("company.industry")
        return {
            "sufficient":     len(missing) < 2,
            "missing_fields": missing,
        }

    # ── Correction builder ────────────────────────────────────────────────────

    def _build_correction(self, layers: dict, attempt: int) -> str:
        lines = [
            f"\n\n=== GOVERNANCE CORRECTION (Attempt {attempt + 1}/{MAX_ATTEMPTS}) ===",
            "The previous email FAILED governance. Fix every issue below before responding:",
        ]

        val = layers.get("validator", {})
        for issue in val.get("issues", []):
            if issue.startswith("shape:missing_fields:"):
                fields = issue.replace("shape:missing_fields:", "")
                lines.append(f"  ✗ SHAPE: Missing JSON fields: {fields}. Include them.")
            elif issue.startswith("context:company_name_absent:"):
                name = issue.replace("context:company_name_absent:", "")
                lines.append(f"  ✗ CONTEXT: Company name '{name}' not mentioned. Reference it explicitly.")
            elif "response_too_short" in issue:
                lines.append("  ✗ CONTEXT: Response too short. Write a complete email body.")
            elif issue.startswith("policy:"):
                lines.append(f"  ✗ POLICY: {issue.replace('policy:', '')}. Revise to comply.")
            else:
                lines.append(f"  ✗ VALIDATOR: {issue}")

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

        lines.append("\nRegenerate the COMPLETE email JSON addressing every issue above.")
        return "\n".join(lines)
