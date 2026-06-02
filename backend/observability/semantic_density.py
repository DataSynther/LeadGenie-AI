"""Semantic density scoring for agent context.

Measures whether context field values contain substantive content,
not just whether the key exists. Replaces the binary field-presence
check that was used for CATEGORY_CONTEXT detection.

Score 0.0–1.0 per field:
  0.0 = None, empty, or a known stub value ("n/a", "unknown", etc.)
  0.1 = present but < 5 chars (single word / symbol)
  0.4 = present but very thin (5–14 chars)
  0.75 = moderate content (15–79 chars)
  1.0 = substantive content (80+ chars or non-zero numeric / non-empty list)

Overall context density = weighted mean across all fields.
Fires CATEGORY_CONTEXT when density < 0.5.
"""

STUB_VALUES = {
    "n/a", "na", "none", "unknown", "not available", "tbd", "not specified",
    "null", "undefined", "—", "-", "?", "n.a.", "not found", "missing",
    "no data", "unspecified", "blank",
}

_MINIMUM_THIN = 5
_MINIMUM_MODERATE = 15
_MINIMUM_SUBSTANTIVE = 80

# Context fields with weights (higher = more critical)
_FIELDS = [
    ("lead",     ["name", "title", "email"],                                      1.5),
    ("company",  ["name", "industry", "employee_count", "description"],           1.5),
    ("research", ["summary", "pain_points", "growth_stage", "ai_readiness_score"], 2.0),
    ("signals",  [],                                                               0.5),
]


def score_value(value) -> float:
    """Return density score 0–1 for any single value."""
    if value is None:
        return 0.0

    if isinstance(value, bool):
        return 0.8

    if isinstance(value, (int, float)):
        return 0.0 if value == 0 else 1.0

    if isinstance(value, str):
        stripped = value.strip()
        if not stripped or stripped.lower() in STUB_VALUES:
            return 0.0
        length = len(stripped)
        if length < _MINIMUM_THIN:
            return 0.1
        if length < _MINIMUM_MODERATE:
            return 0.4
        if length < _MINIMUM_SUBSTANTIVE:
            return 0.75
        return 1.0

    if isinstance(value, list):
        if not value:
            return 0.0
        scores = [score_value(v) for v in value]
        return round(sum(scores) / len(scores), 3)

    if isinstance(value, dict):
        if not value:
            return 0.0
        scores = [score_value(v) for v in value.values()]
        return round(sum(scores) / len(scores), 3)

    return 0.5


def score_context_semantic_density(context: dict) -> float:
    """Return 0–1 weighted density score for the full context object.

    Used in AgentTracer to decide whether CATEGORY_CONTEXT should fire.
    Also exposed in trace metadata as context_score.
    """
    if not context:
        return 0.0

    total_weight = 0.0
    weighted_sum = 0.0

    for top_key, subfields, weight in _FIELDS:
        top_val = context.get(top_key)

        if not subfields:
            # Top-level value (e.g. signals dict)
            field_score = score_value(top_val)
            weighted_sum += field_score * weight
            total_weight += weight
        else:
            for sf in subfields:
                if isinstance(top_val, dict):
                    field_val = top_val.get(sf)
                else:
                    field_val = None
                field_score = score_value(field_val)
                weighted_sum += field_score * weight
                total_weight += weight

    return round(weighted_sum / max(total_weight, 1.0), 3)


def explain_density(context: dict) -> dict:
    """Return per-field density scores for display in the dev dashboard."""
    breakdown = {}
    for top_key, subfields, _ in _FIELDS:
        top_val = context.get(top_key)
        if not subfields:
            breakdown[top_key] = score_value(top_val)
        else:
            breakdown[top_key] = {}
            for sf in subfields:
                fv = top_val.get(sf) if isinstance(top_val, dict) else None
                breakdown[top_key][sf] = score_value(fv)
    return breakdown
