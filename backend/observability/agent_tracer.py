"""Wraps every Claude API call to capture latency, context quality, and diagnostic signals."""
import time
import re
from contextlib import contextmanager
from typing import Optional

from observability.diagnostic_store import (
    write_trace,
    CATEGORY_RETRIEVAL,
    CATEGORY_CONTEXT,
    CATEGORY_PROMPT,
    CATEGORY_TASK_MISMATCH,
)

# Patterns that indicate vague / ambiguous instructions in a prompt
_AMBIGUITY_PATTERNS = re.compile(
    r"\b(if appropriate|as needed|something like|maybe|perhaps|generally|"
    r"usually|feel free to|at your discretion|if relevant|whenever possible|"
    r"try to|you might|could consider)\b",
    re.IGNORECASE,
)

# Required context fields — presence scores context completeness
_CONTEXT_FIELDS = [
    ("lead", ["name", "title", "email"]),
    ("company", ["name", "industry", "employee_count"]),
    ("research", ["summary", "pain_points", "growth_stage"]),
    ("signals", []),
]

# Minimum confidence below which we flag task-model mismatch
CONFIDENCE_THRESHOLD = 0.65

# Minimum retrieval score below which we flag retrieval failure
RETRIEVAL_SCORE_THRESHOLD = 0.55


def score_context_completeness(context: dict) -> float:
    """Return 0–1 score: fraction of expected context fields that are populated."""
    if not context:
        return 0.0
    total, present = 0, 0
    for top_key, subfields in _CONTEXT_FIELDS:
        top_val = context.get(top_key)
        if not subfields:
            total += 1
            if top_val:
                present += 1
        else:
            for sf in subfields:
                total += 1
                if top_val and top_val.get(sf):
                    present += 1
    return round(present / max(total, 1), 3)


def score_prompt_ambiguity(prompt: str) -> float:
    """Return 0–1 ambiguity score: proportion of ambiguous phrases per 100 words."""
    if not prompt:
        return 0.0
    matches = len(_AMBIGUITY_PATTERNS.findall(prompt))
    words = max(len(prompt.split()), 1)
    return round(min(matches / (words / 100), 1.0), 3)


def detect_categories(
    context_score: float,
    ambiguity_score: float,
    retrieval_score: Optional[float],
    confidence: Optional[float],
) -> list[str]:
    """Return the list of diagnostic categories that fired for this call."""
    cats = []
    if retrieval_score is not None and retrieval_score < RETRIEVAL_SCORE_THRESHOLD:
        cats.append(CATEGORY_RETRIEVAL)
    if context_score < 0.5:
        cats.append(CATEGORY_CONTEXT)
    if ambiguity_score > 0.3:
        cats.append(CATEGORY_PROMPT)
    if confidence is not None and confidence < CONFIDENCE_THRESHOLD:
        cats.append(CATEGORY_TASK_MISMATCH)
    return cats


class AgentTracer:
    """Call .trace() around a Claude messages.create() to record a diagnostic trace.

    Usage:
        tracer = AgentTracer(agent="outreach", lead_id=lead_id, context=context)
        with tracer.trace(prompt=prompt_text) as t:
            response = client.messages.create(...)
            t.finish(response, confidence=email_result.get("confidence"))
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
        self.retrieval_score = retrieval_score
        self.prompt_version = prompt_version

    @contextmanager
    def trace(self, prompt: str = "", system: str = ""):
        """Context manager that times the block and writes a trace on exit."""
        full_prompt = f"{system}\n{prompt}".strip()
        context_score = score_context_completeness(self.context)
        ambiguity_score = score_prompt_ambiguity(full_prompt)

        t0 = time.perf_counter()
        tracker = _TraceTracker()
        try:
            yield tracker
        finally:
            latency_ms = (time.perf_counter() - t0) * 1000
            confidence = tracker.confidence
            categories = detect_categories(
                context_score, ambiguity_score, self.retrieval_score, confidence
            )

            # Add CATEGORY_PROMPT if validation gap was not caught (no validator used)
            from observability.diagnostic_store import CATEGORY_VALIDATION
            if tracker.validation_skipped:
                categories.append(CATEGORY_VALIDATION)

            tokens = tracker.tokens_used
            response_preview = tracker.response_preview or ""

            write_trace(
                agent=self.agent,
                lead_id=self.lead_id,
                prompt_preview=full_prompt[:300],
                response_preview=response_preview[:300],
                latency_ms=latency_ms,
                tokens_used=tokens,
                success=tracker.success,
                diagnostic_categories=list(set(categories)),
                metadata={
                    "context_score": context_score,
                    "ambiguity_score": ambiguity_score,
                    "retrieval_score": self.retrieval_score,
                    "confidence": confidence,
                    "prompt_version": self.prompt_version,
                    "diagnostic_detail": tracker.diagnostic_detail,
                    "context_fields_used": _populated_fields(self.context),
                },
            )


class _TraceTracker:
    """Mutable handle yielded to the caller inside a trace() block."""

    def __init__(self):
        self.confidence: Optional[float] = None
        self.tokens_used: int = 0
        self.response_preview: str = ""
        self.success: bool = True
        self.validation_skipped: bool = True   # flipped to False when validator runs
        self.diagnostic_detail: str = ""

    def finish(self, response, confidence: Optional[float] = None):
        """Record the Claude response object (anthropic.types.Message)."""
        self.tokens_used = getattr(getattr(response, "usage", None), "input_tokens", 0) + \
                           getattr(getattr(response, "usage", None), "output_tokens", 0)
        self.response_preview = response.content[0].text if response.content else ""
        self.confidence = confidence
        self.success = True

    def mark_validation_ran(self):
        """Call this after the validator has been applied to clear the validation-gap flag."""
        self.validation_skipped = False

    def fail(self, reason: str = ""):
        self.success = False
        self.diagnostic_detail = reason


def _populated_fields(context: dict) -> dict:
    """Return which top-level context keys are populated (for explainability)."""
    result = {}
    for top_key, subfields in _CONTEXT_FIELDS:
        val = context.get(top_key)
        if not subfields:
            result[top_key] = bool(val)
        else:
            result[top_key] = {sf: bool(val and val.get(sf)) for sf in subfields} if val else {sf: False for sf in subfields}
    return result
