"""Quidditch — Prompt & Model Performance Lab.

Run a prompt × model combo, score against ground truth, and persist results.
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
