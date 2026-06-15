"""Quidditch — Prompt & Model Performance Lab.

Run a prompt × model combo, score against ground truth, and persist results.
Includes prompt quality audit against Anthropic prompting best practices.
"""
import json
import os
import re
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import numpy as np
from anthropic import Anthropic

_client = Anthropic()

# ── Prompt quality criteria (Anthropic best practices) ────────────────────────
# Ref: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
#
# Two tiers:
#   Rule-based  — fast regex/heuristic, no API call
#   Semantic    — Claude Haiku judge, only when ANTHROPIC_API_KEY available
#
# Weights sum to 1.0

_PROMPT_CRITERIA_WEIGHTS: dict[str, float] = {
    # Rule-based
    "clarity":              0.10,  # Specific, explicit instructions; no vague openers
    "examples_present":     0.10,  # 3-5 diverse examples in <example> tags
    "xml_structure":        0.07,  # <instructions>/<context>/<input> separation
    "role_assignment":      0.05,  # "You are a/an…" in system prompt
    "no_prefill":           0.04,  # No prefilled assistant turn (deprecated 4.6+)
    "positive_format":      0.06,  # Format instructions positive ("write X") not negative ("don't use X")
    "output_explicit":      0.07,  # Explicit output format stated (JSON, prose, list…)
    "self_check":           0.05,  # Instructs model to verify output before finishing
    "no_over_prompting":    0.04,  # No excessive CRITICAL/MUST/ALWAYS caps emphasis
    "specificity":          0.06,  # Concrete constraints (length, format, tone)
    # Semantic (Haiku judge)
    "context_motivation":   0.08,  # Explains WHY, not just WHAT
    "anti_hallucination":   0.12,  # Guard: "investigate before asserting / read before answering"
    "effort_calibration":   0.06,  # Thinking/effort level appropriate for task complexity
    "golden_rule":          0.10,  # Clear to a colleague with minimal context
    "agentic_safety":       0.03,  # If agentic, guardrails for risky/destructive actions
    "scope_control":        0.07,  # Minimal, focused — no over-engineering or padding
}

_VAGUE_OPENERS = re.compile(
    r"\b(can you|could you|please try|maybe|you might|you could|consider|feel free|"
    r"if you want|whenever possible|as much as possible)\b", re.I
)
_NEGATIVE_FORMAT = re.compile(
    r"\b(don't use|do not use|avoid using|never use|don't include|do not include)\b"
    r".{0,40}(bullet|markdown|list|header|bold|italic|table|json|xml)", re.I
)
_OVER_PROMPT = re.compile(r"\b(CRITICAL|MUST|ALWAYS|NEVER|IMPORTANT|WARNING)\b")


def _rule_based_prompt_scores(prompt: str) -> dict[str, float]:
    """Fast structural checks, no API call."""
    scores: dict[str, float] = {}

    # clarity — penalise vague openers
    vague_count = len(_VAGUE_OPENERS.findall(prompt))
    scores["clarity"] = max(0.0, round(1.0 - vague_count * 0.25, 2))

    # examples_present — count <example> tags or inline "Example:" labels
    example_count = len(re.findall(r"<example>|<examples>|Example\s*\d*\s*:", prompt, re.I))
    scores["examples_present"] = 1.0 if example_count >= 3 else (0.5 if example_count >= 1 else 0.0)

    # xml_structure — any structured XML tags for prompt sections
    xml_tags = re.findall(r"<(instructions?|context|input|task|system|output|format|constraints?)>", prompt, re.I)
    scores["xml_structure"] = 1.0 if len(set(xml_tags)) >= 2 else (0.5 if len(set(xml_tags)) == 1 else 0.0)

    # role_assignment
    scores["role_assignment"] = 1.0 if re.search(r"\byou are (a|an)\b", prompt, re.I) else 0.0

    # no_prefill — look for assistant: pattern at end of prompt
    scores["no_prefill"] = 0.0 if re.search(r"(assistant|claude)\s*:", prompt[-200:], re.I) else 1.0

    # positive_format
    scores["positive_format"] = 0.0 if _NEGATIVE_FORMAT.search(prompt) else 1.0

    # output_explicit — explicit output format named
    scores["output_explicit"] = 1.0 if re.search(
        r"\b(JSON|YAML|markdown|prose|plain text|bullet|numbered list|table|HTML|XML|structured)\b", prompt, re.I
    ) else 0.0

    # self_check — verify / double-check instruction
    scores["self_check"] = 1.0 if re.search(
        r"\b(verify|double.check|before you finish|confirm|review your|check your|validate)\b", prompt, re.I
    ) else 0.0

    # no_over_prompting — excessive caps emphasis degrades newer models
    caps_count = len(_OVER_PROMPT.findall(prompt))
    scores["no_over_prompting"] = max(0.0, round(1.0 - max(0, caps_count - 2) * 0.2, 2))

    # specificity — concrete constraints present
    scores["specificity"] = 1.0 if re.search(
        r"\b(\d+\s*(words?|characters?|sentences?|lines?|paragraphs?|tokens?)|"
        r"concise|brief|detailed|formal|casual|professional|technical)\b", prompt, re.I
    ) else 0.0

    return scores


_SEMANTIC_PROMPT = """You are evaluating a prompt template against Anthropic's prompting best practices.
Score ONLY the following criteria. Return valid JSON with float scores 0.0-1.0.

Criteria definitions:
- context_motivation: Does the prompt explain WHY (because/since/so that/reason), not just WHAT to do?
- anti_hallucination: Does it guard against speculation? (e.g. "read the file before answering", "only assert facts from context", "investigate before answering")
- effort_calibration: Is the thinking/effort level appropriate — neither under-specified nor over-prompting with excessive CRITICAL/MUST/ALWAYS?
- golden_rule: Would a colleague with minimal context follow this prompt correctly without guessing?
- agentic_safety: If this is an agentic task, does it include guardrails for reversible vs irreversible actions? (score 0.7 if not agentic, 1.0 if agentic with guardrails, 0.0 if agentic without)
- scope_control: Is the scope minimal and focused — no padding, no requests for unnecessary extras, no over-engineering instruction?

Respond ONLY with JSON, no explanation:
{"context_motivation": 0.0, "anti_hallucination": 0.0, "effort_calibration": 0.0, "golden_rule": 0.0, "agentic_safety": 0.0, "scope_control": 0.0}

Prompt to evaluate:
<prompt>
{prompt}
</prompt>"""


def _semantic_prompt_scores(prompt: str) -> dict[str, float]:
    """Claude Haiku judges subjective criteria. Returns {} if unavailable."""
    try:
        resp = _client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=256,
            messages=[{"role": "user", "content": _SEMANTIC_PROMPT.format(prompt=prompt[:3000])}],
        )
        raw = resp.content[0].text.strip()
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if match:
            data = json.loads(match.group())
            return {k: max(0.0, min(1.0, float(v))) for k, v in data.items()}
    except Exception:
        pass
    return {}


def audit_prompt_quality(prompt: str, use_llm: bool = True) -> dict:
    """Score a prompt against Anthropic prompting best practices.

    Returns per-criterion scores, weighted aggregate, pass/fail, and warnings.
    """
    scores = _rule_based_prompt_scores(prompt)
    if use_llm:
        scores.update(_semantic_prompt_scores(prompt))

    # Fill missing semantic scores as None (excluded from aggregate)
    all_criteria = list(_PROMPT_CRITERIA_WEIGHTS.keys())
    for c in all_criteria:
        if c not in scores:
            scores[c] = None

    # Weighted aggregate over available scores only
    total_weight = 0.0
    weighted_sum = 0.0
    for criterion, weight in _PROMPT_CRITERIA_WEIGHTS.items():
        val = scores.get(criterion)
        if val is not None:
            weighted_sum += val * weight
            total_weight  += weight
    aggregate = round(weighted_sum / total_weight, 4) if total_weight > 0 else 0.0

    warnings = []
    for criterion, val in scores.items():
        if val is not None and val < 0.5:
            warnings.append(f"{criterion}: {val:.2f} (below 0.5 — see Anthropic best practices)")
    if aggregate < 0.6:
        warnings.insert(0, f"Overall prompt quality {aggregate:.2f} < 0.6 — consider revising before production use")

    return {
        "scores":         scores,
        "aggregate":      aggregate,
        "passed":         aggregate >= 0.6,
        "warnings":       warnings,
        "llm_judged":     use_llm,
        "criteria_ref":   "https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices",
    }

# ── Pricing ($ per 1M tokens, exact input + output) ───────────────────────────
_PRICING: dict[str, dict[str, float]] = {
    "claude-haiku-4-5-20251001": {"input": 0.80,  "output": 4.00},
    "claude-sonnet-4-6":         {"input": 3.00,  "output": 15.00},
    "claude-opus-4-7":           {"input": 15.00, "output": 75.00},
}
MODEL_CHOICES = {
    "haiku":  "claude-haiku-4-5-20251001",
    "sonnet": "claude-sonnet-4-6",
    "opus":   "claude-opus-4-7",
}
MODEL_DISPLAY = {
    "claude-haiku-4-5-20251001": "Haiku 4.5",
    "claude-sonnet-4-6":         "Sonnet 4.6",
    "claude-opus-4-7":           "Opus 4.7",
}

_STORE = Path(__file__).parent.parent / "data" / "quidditch_runs.json"


def _estimate_cost(model: str, in_tok: int, out_tok: int) -> float:
    p = _PRICING.get(model, _PRICING["claude-sonnet-4-6"])
    return (in_tok * p["input"] + out_tok * p["output"]) / 1_000_000


def _bleu1(hypothesis: str, reference: str) -> float:
    """Unigram precision — fraction of hypothesis tokens that appear in reference."""
    ref_tokens = set(re.findall(r"\b\w+\b", reference.lower()))
    hyp_tokens = re.findall(r"\b\w+\b", hypothesis.lower())
    if not hyp_tokens:
        return 0.0
    return round(sum(1 for t in hyp_tokens if t in ref_tokens) / len(hyp_tokens), 4)


def _semantic_sim(text_a: str, text_b: str) -> Optional[float]:
    """Voyage AI cosine similarity between two texts. Jaccard fallback if unavailable."""
    try:
        import voyageai
        api_key = os.getenv("VOYAGE_API_KEY")
        if api_key:
            vo = voyageai.Client(api_key=api_key)
            result = vo.embed([text_a, text_b], model="voyage-3")
            embs = result.embeddings
            va, vb = np.array(embs[0]), np.array(embs[1])
            norm = np.linalg.norm(va) * np.linalg.norm(vb)
            return round(float(np.dot(va, vb) / norm), 4) if norm > 0 else 0.0
    except Exception:
        pass
    # Jaccard fallback
    words_a = set(re.findall(r"\b\w{3,}\b", text_a.lower()))
    words_b = set(re.findall(r"\b\w{3,}\b", text_b.lower()))
    if not words_a or not words_b:
        return None
    return round(len(words_a & words_b) / len(words_a | words_b), 4)


def run_match(
    prompt_template: str,
    model: str,
    ground_truth: str = "",
    prompt_name: str = "",
    mock_context: Optional[dict] = None,
) -> dict:
    """Execute one Quidditch match: generate → score → persist → return."""
    model = MODEL_CHOICES.get(model, model)
    if model not in _PRICING:
        model = "claude-sonnet-4-6"

    t0 = time.monotonic()

    # ── 1. Generate ───────────────────────────────────────────────────────────
    response = _client.messages.create(
        model=model,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt_template}],
    )
    latency_s = round(time.monotonic() - t0, 2)
    generated_text: str = response.content[0].text.strip()
    in_tok  = response.usage.input_tokens
    out_tok = response.usage.output_tokens

    metrics: dict = {
        "latency_s":    latency_s,
        "cost_usd":     round(_estimate_cost(model, in_tok, out_tok), 6),
        "input_tokens": in_tok,
        "output_tokens": out_tok,
    }

    # ── 2. Tone check ─────────────────────────────────────────────────────────
    try:
        from governance.tone_validator import ToneValidator
        tone = ToneValidator().validate({"body": generated_text})
        metrics["tone_passed"] = tone.get("passed", True)
        metrics["tone_issues"] = tone.get("issues", [])
    except Exception:
        pass

    # ── 3. Hallucination check ────────────────────────────────────────────────
    try:
        from governance.hallucination_checker import HallucinationChecker
        sf: dict = {}
        if mock_context:
            company = mock_context.get("company") or {}
            lead    = mock_context.get("lead") or {}
            sf = {k: v for k, v in {
                "company_name": company.get("name"),
                "industry":     company.get("industry"),
                "lead_title":   lead.get("title"),
                "description":  company.get("description"),
                "technologies": company.get("technologies", []),
            }.items() if v}
        if ground_truth:
            sf["ground_truth_reference"] = ground_truth[:600]
        halluc = HallucinationChecker().check(generated_text, sf or None)
        metrics["hallucination_passed"]     = halluc.get("passed", True)
        metrics["hallucination_confidence"] = halluc.get("confidence")
        metrics["hallucination_violations"] = halluc.get("violations", [])
        metrics["hallucination_explanation"]= halluc.get("explanation", "")
    except Exception:
        pass

    # ── 4. Self-eval confidence ───────────────────────────────────────────────
    try:
        from observability.self_evaluator import self_evaluate, context_to_summary
        ctx_sum = context_to_summary(mock_context) if mock_context else "prompt-only run"
        se = self_evaluate("outreach", generated_text, ctx_sum, prompt_template[:200])
        if se:
            metrics["self_eval_confidence"]  = se.get("confidence")
            metrics["self_eval_sufficient"]  = se.get("sufficient_info")
            metrics["self_eval_explanation"] = se.get("explanation", "")
    except Exception:
        pass

    # ── 5. Retrieval score (if context provided) ──────────────────────────────
    if mock_context:
        try:
            from observability.retrieval_checker import compute_retrieval_score
            rs = compute_retrieval_score(generated_text, mock_context)
            if rs is not None:
                metrics["retrieval_score"] = round(rs, 4)
        except Exception:
            pass

    # ── 6. GT similarity metrics ──────────────────────────────────────────────
    if ground_truth:
        metrics["bleu1_gt"] = _bleu1(generated_text, ground_truth)
        sim = _semantic_sim(generated_text, ground_truth)
        if sim is not None:
            metrics["semantic_sim_gt"] = sim

    # ── 7. Prompt quality audit (Anthropic best practices) ────────────────────
    try:
        pq = audit_prompt_quality(prompt_template, use_llm=True)
        metrics["prompt_quality"] = pq
    except Exception:
        pass

    run = {
        "run_id":          str(uuid.uuid4())[:8],
        "ts":              datetime.now(timezone.utc).isoformat(),
        "model":           model,
        "model_display":   MODEL_DISPLAY.get(model, model),
        "prompt_name":     prompt_name or "unnamed",
        "prompt_template": prompt_template,
        "ground_truth":    ground_truth,
        "generated_text":  generated_text,
        "metrics":         metrics,
        "human_scores":    {},
    }
    _persist(run)
    return run


def get_history() -> list:
    return list(reversed(_load()))


def patch_human_scores(run_id: str, human_scores: dict) -> bool:
    runs = _load()
    for r in runs:
        if r.get("run_id") == run_id:
            r["human_scores"] = {**r.get("human_scores", {}), **human_scores}
            _STORE.write_text(json.dumps(runs, indent=2))
            return True
    return False


def _load() -> list:
    if not _STORE.exists():
        return []
    try:
        return json.loads(_STORE.read_text())
    except Exception:
        return []


def _persist(run: dict) -> None:
    _STORE.parent.mkdir(parents=True, exist_ok=True)
    runs = _load()
    runs.append(run)
    _STORE.write_text(json.dumps(runs, indent=2))
