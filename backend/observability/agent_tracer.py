"""Wraps every Claude API call to capture latency, context quality, and diagnostic signals."""
import time
import logging
from contextlib import contextmanager
from typing import Optional

from observability.diagnostic_store import (
    write_trace,
    CATEGORY_RETRIEVAL,
    CATEGORY_CONTEXT,
    CATEGORY_PROMPT,
    CATEGORY_VALIDATION,
    CATEGORY_TASK_MISMATCH,
)
from observability.semantic_density import score_context_semantic_density, explain_density
from observability.retrieval_checker import RETRIEVAL_FAILURE_THRESHOLD
from observability import interpretation_tracker

logger = logging.getLogger(__name__)

# Confidence below which CATEGORY_TASK_MISMATCH fires (from self-eval or model output)
CONFIDENCE_THRESHOLD = 0.65

# Context density below which CATEGORY_CONTEXT fires
CONTEXT_DENSITY_THRESHOLD = 0.5


def score_prompt_ambiguity(prompt: str) -> float:
    """Return 0–1 ambiguity score: proportion of ambiguous phrases per 100 words."""
    import re
    _AMBIGUITY = re.compile(
        r"\b(if appropriate|as needed|something like|maybe|perhaps|generally|"
        r"usually|feel free to|at your discretion|if relevant|whenever possible|"
        r"try to|you might|could consider)\b",
        re.IGNORECASE,
    )
    if not prompt:
        return 0.0
    matches = len(_AMBIGUITY.findall(prompt))
    words = max(len(prompt.split()), 1)
    return round(min(matches / (words / 100), 1.0), 3)


def detect_categories(
    context_score: float,
    ambiguity_score: float,
    retrieval_score: Optional[float],
    confidence: Optional[float],
    is_new_interpretation: bool = False,
) -> list:
    cats = []
    if retrieval_score is not None and retrieval_score < RETRIEVAL_FAILURE_THRESHOLD:
        cats.append(CATEGORY_RETRIEVAL)
    if context_score < CONTEXT_DENSITY_THRESHOLD:
        cats.append(CATEGORY_CONTEXT)
    # Fires on high ambiguity OR a new interpretation being detected
    if ambiguity_score > 0.3 or is_new_interpretation:
        cats.append(CATEGORY_PROMPT)
    if confidence is not None and confidence < CONFIDENCE_THRESHOLD:
        cats.append(CATEGORY_TASK_MISMATCH)
    return cats


class AgentTracer:
    """Call .trace() around a Claude messages.create() to record a diagnostic trace.

    Usage:
        tracer = AgentTracer(agent="outreach", lead_id=lead_id, context=context,
                             prompt_version="outreach_email_v1")
        with tracer.trace(prompt=prompt_text, system=system_prompt) as t:
            response = client.messages.create(...)
            result   = parse(response)
            t.finish(response, confidence=result.get("confidence"))
            t.set_retrieval_score(compute_retrieval_score(result["body"], context))
            t.set_self_eval(self_evaluate("outreach", result["body"], ctx_summary))
            Validator("outreach", lead_id, context).validate(result, tracker=t)
    """

    def __init__(
        self,
        agent: str,
        lead_id: Optional[str] = None,
        context: Optional[dict] = None,
        retrieval_score: Optional[float] = None,
        prompt_version: Optional[str] = None,
    ):
        self.agent = agent
        self.lead_id = lead_id
        self.context = context or {}
        self.retrieval_score = retrieval_score   # can be overridden via t.set_retrieval_score()
        self.prompt_version = prompt_version

    @contextmanager
    def trace(self, prompt: str = "", system: str = ""):
        """Context manager: times the block, writes a trace on exit."""
        full_prompt = f"{system}\n{prompt}".strip()
        context_score = score_context_semantic_density(self.context)
        density_breakdown = explain_density(self.context)
        ambiguity_score = score_prompt_ambiguity(full_prompt)

        t0 = time.perf_counter()
        tracker = _TraceTracker()
        try:
            yield tracker
        finally:
            latency_ms = (time.perf_counter() - t0) * 1000

            # Effective retrieval score: prefer the one set dynamically inside the block
            retrieval_score = (
                tracker.retrieval_score
                if tracker.retrieval_score is not None
                else self.retrieval_score
            )

            # Effective confidence: prefer self-eval confidence over model-reported confidence
            self_eval = tracker.self_eval_result or {}
            confidence = self_eval.get("confidence") if self_eval else tracker.confidence

            # Interpretation drift check
            is_new_interp = False
            if self.prompt_version and tracker.response_preview:
                try:
                    is_new_interp = interpretation_tracker.check_and_record(
                        prompt_version=self.prompt_version,
                        response_text=tracker.response_preview,
                        agent=self.agent,
                        lead_id=self.lead_id,
                    )
                except Exception as e:
                    logger.debug("Interpretation tracker failed: %s", e)

            categories = detect_categories(
                context_score, ambiguity_score, retrieval_score,
                confidence, is_new_interp,
            )

            from observability.diagnostic_store import CATEGORY_VALIDATION  # noqa: avoid circular at module level
            if tracker.validation_skipped:
                categories.append(CATEGORY_VALIDATION)

            write_trace(
                agent=self.agent,
                lead_id=self.lead_id,
                prompt_preview=full_prompt[:300],
                response_preview=(tracker.response_preview or "")[:300],
                latency_ms=latency_ms,
                tokens_used=tracker.tokens_used,
                success=tracker.success,
                diagnostic_categories=list(set(categories)),
                metadata={
                    "context_score": context_score,
                    "context_density_breakdown": density_breakdown,
                    "ambiguity_score": ambiguity_score,
                    "retrieval_score": retrieval_score,
                    "confidence": confidence,
                    "prompt_version": self.prompt_version,
                    "diagnostic_detail": tracker.diagnostic_detail,
                    "context_fields_used": _populated_fields(self.context),
                    "is_new_interpretation": is_new_interp,
                    "self_eval": self_eval or None,
                    "citations": tracker.citations or None,
                },
            )


class _TraceTracker:
    """Mutable handle yielded to the caller inside a trace() block."""

    def __init__(self):
        self.confidence: Optional[float] = None
        self.tokens_used: int = 0
        self.response_preview: str = ""
        self.success: bool = True
        self.validation_skipped: bool = True    # cleared by mark_validation_ran()
        self.diagnostic_detail: str = ""
        self.retrieval_score: Optional[float] = None  # set via set_retrieval_score()
        self.self_eval_result: Optional[dict] = None  # set via set_self_eval()
        self.citations: Optional[dict] = None         # set via set_citations()

    def finish(self, response, confidence: Optional[float] = None):
        """Record the Claude response (anthropic.types.Message)."""
        usage = getattr(response, "usage", None)
        self.tokens_used = (
            getattr(usage, "input_tokens", 0) + getattr(usage, "output_tokens", 0)
        )
        self.response_preview = response.content[0].text if response.content else ""
        self.confidence = confidence
        self.success = True

    def mark_validation_ran(self):
        """Call after Validator.validate() to clear the validation-gap flag."""
        self.validation_skipped = False

    def set_retrieval_score(self, score: Optional[float]):
        """Set embedding/Jaccard grounding score computed after response is parsed."""
        self.retrieval_score = score

    def set_self_eval(self, result: Optional[dict]):
        """Set self-evaluation result from self_evaluator.self_evaluate()."""
        self.self_eval_result = result

    def set_citations(self, citations: dict):
        """Attach source attribution map to this trace."""
        self.citations = citations

    def fail(self, reason: str = ""):
        self.success = False
        self.diagnostic_detail = reason


def _populated_fields(context: dict) -> dict:
    from observability.semantic_density import _FIELDS, score_value
    result = {}
    for top_key, subfields, _ in _FIELDS:
        val = context.get(top_key)
        if not subfields:
            result[top_key] = bool(val)
        else:
            result[top_key] = (
                {sf: score_value((val or {}).get(sf)) for sf in subfields}
                if val else {sf: 0.0 for sf in subfields}
            )
    return result
