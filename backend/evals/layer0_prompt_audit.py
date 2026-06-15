"""
Layer 0 — Prompt Quality Audit
Static analysis of prompt templates. No actual generation calls.
Rule-based checks + optional Claude Haiku semantic scoring.
"""
import json
import os
import re
from typing import Optional

WEIGHTS = {
    "clarity": 0.15,
    "context_motivation": 0.10,
    "examples_present": 0.12,
    "xml_structure": 0.10,
    "role_assignment": 0.08,
    "positive_format": 0.10,
    "tool_explicit": 0.08,
    "anti_hallucination": 0.15,
    "no_prefill": 0.07,
    "specificity": 0.05,
}

RULE_BASED = {"examples_present", "xml_structure", "no_prefill", "role_assignment"}
SEMANTIC = {"clarity", "context_motivation", "positive_format", "tool_explicit", "anti_hallucination", "specificity"}

VAGUE_VERBS = re.compile(r"\b(suggest|maybe|can you|perhaps|might want|consider)\b", re.IGNORECASE)
MOTIVATION_WORDS = re.compile(r"\b(because|since|so that|reason|in order to|therefore)\b", re.IGNORECASE)
EXAMPLE_TAGS = re.compile(r"<example>|<examples?>", re.IGNORECASE)
XML_TAGS = re.compile(r"<(instructions?|context|input|output|system|task|format)>", re.IGNORECASE)
PREFILL_PATTERN = re.compile(r"^\s*assistant\s*:", re.IGNORECASE | re.MULTILINE)
ROLE_PATTERN = re.compile(r"\bYou are (a|an|the)\b", re.IGNORECASE)
IMPERATIVE_TOOLS = re.compile(r"\b(Run|Call|Execute|Invoke|Fetch|Search|Use|Query)\b")
ANTI_HALLUC = re.compile(
    r"(read the file before|investigate before|only assert facts|based on the (context|facts)|do not (make up|invent|fabricate)|only use information from)",
    re.IGNORECASE,
)
CONCRETE_CONSTRAINTS = re.compile(
    r"(\d+\s*(words?|sentences?|characters?|lines?|paragraphs?|bullet)|"
    r"(formal|casual|professional|concise|brief|detailed)\s+tone|"
    r"in\s+(prose|markdown|json|bullet\s*points?))",
    re.IGNORECASE,
)


def _rule_based_scores(prompt: str) -> dict[str, float]:
    scores: dict[str, float] = {}

    # examples_present
    tag_matches = len(EXAMPLE_TAGS.findall(prompt))
    inline_examples = len(re.findall(r"example\s*\d+|e\.g\.", prompt, re.IGNORECASE))
    scores["examples_present"] = 1.0 if tag_matches >= 1 or inline_examples >= 3 else (0.5 if inline_examples >= 1 else 0.0)

    # xml_structure
    scores["xml_structure"] = 1.0 if len(XML_TAGS.findall(prompt)) >= 2 else (0.5 if len(XML_TAGS.findall(prompt)) == 1 else 0.0)

    # no_prefill
    scores["no_prefill"] = 0.0 if PREFILL_PATTERN.search(prompt) else 1.0

    # role_assignment
    scores["role_assignment"] = 1.0 if ROLE_PATTERN.search(prompt) else 0.0

    return scores


def _llm_semantic_scores(prompt: str) -> Optional[dict[str, float]]:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return None

    try:
        import anthropic  # noqa: PLC0415
        client = anthropic.Anthropic(api_key=api_key)
    except ImportError:
        return None

    semantic_criteria = "\n".join(
        f"- {c}: score 0-10" for c in sorted(SEMANTIC)
    )
    judge_prompt = f"""Score this prompt on each criterion from 0-10.

Criteria:
- clarity: no vague verbs (suggest/maybe/can you), specific output described. 10=perfectly clear.
- context_motivation: explains WHY not just WHAT (because/since/so that). 10=strong motivation.
- positive_format: format instructions are positive ("write in prose") not negative ("don't use bullets"). 10=all positive.
- tool_explicit: tool/action instructions use imperative (Run/Call) not conditional. 10=fully imperative.
- anti_hallucination: has a guard against making up facts. 10=explicit guard present.
- specificity: has concrete constraints (length, format, tone). 10=highly specific.

Prompt to score:
\"\"\"
{prompt[:3000]}
\"\"\"

Respond with ONLY valid JSON, keys matching the criteria names, integer values 0-10:
{{"clarity": N, "context_motivation": N, "positive_format": N, "tool_explicit": N, "anti_hallucination": N, "specificity": N}}"""

    try:
        resp = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=200,
            messages=[{"role": "user", "content": judge_prompt}],
        )
        raw = resp.content[0].text.strip()
        match = re.search(r"\{[\s\S]*\}", raw)
        if not match:
            return None
        parsed = json.loads(match.group())
        return {k: min(1.0, max(0.0, v / 10.0)) for k, v in parsed.items() if k in SEMANTIC}
    except Exception:
        return None


def audit_prompt(prompt_text: str, prompt_name: str, use_llm: bool = True) -> dict:
    """
    Audit a prompt template for quality across 10 criteria.
    Returns: {prompt_name, scores, aggregate_score, passed, warnings}
    """
    scores: dict[str, Optional[float]] = _rule_based_scores(prompt_text)
    warnings: list[str] = []

    # Semantic scoring
    semantic_scores: Optional[dict[str, float]] = None
    if use_llm:
        semantic_scores = _llm_semantic_scores(prompt_text)

    if semantic_scores:
        scores.update(semantic_scores)
    else:
        # Lightweight rule-based fallbacks for semantic criteria
        vague_count = len(VAGUE_VERBS.findall(prompt_text))
        scores["clarity"] = max(0.0, 1.0 - vague_count * 0.2)
        scores["context_motivation"] = 1.0 if MOTIVATION_WORDS.search(prompt_text) else 0.0
        scores["positive_format"] = 0.5  # cannot determine without LLM
        scores["tool_explicit"] = 1.0 if IMPERATIVE_TOOLS.search(prompt_text) else 0.3
        scores["anti_hallucination"] = 1.0 if ANTI_HALLUC.search(prompt_text) else 0.0
        scores["specificity"] = 1.0 if CONCRETE_CONSTRAINTS.search(prompt_text) else 0.2
        if not os.environ.get("ANTHROPIC_API_KEY"):
            warnings.append("ANTHROPIC_API_KEY not set — semantic scores use rule-based fallbacks")

    # Aggregate weighted score (only include criteria with non-None scores)
    total_weight = 0.0
    weighted_sum = 0.0
    for criterion, weight in WEIGHTS.items():
        val = scores.get(criterion)
        if val is not None:
            weighted_sum += val * weight
            total_weight += weight

    aggregate = weighted_sum / total_weight if total_weight > 0 else 0.0

    # Collect warnings for low scores
    for criterion, val in scores.items():
        if val is not None and val < 0.5:
            warnings.append(f"Low score on '{criterion}': {val:.2f}")

    return {
        "prompt_name": prompt_name,
        "scores": scores,
        "aggregate_score": round(aggregate, 4),
        "passed": aggregate >= 0.6,
        "warnings": warnings,
    }
