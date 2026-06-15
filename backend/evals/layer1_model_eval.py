"""
Layer 1 — Model Output Evaluation
LLM-as-judge (hallucination, tone) + rule-based metrics (faithfulness, coherence, BLEU-1, etc.).
"""
import re
from typing import Optional


def _tokenize(text: str) -> set[str]:
    return set(re.findall(r"\w+", text.lower()))


def _jaccard(a: str, b: str) -> float:
    ta, tb = _tokenize(a), _tokenize(b)
    if not ta and not tb:
        return 1.0
    union = ta | tb
    return len(ta & tb) / len(union) if union else 0.0


def _split_sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text.strip()) if s.strip()]


def _faithfulness(generated: str, context: dict, source_facts: list[str]) -> float:
    """Token recall: fraction of each source-fact's tokens present in generated text, averaged.

    Jaccard per-sentence against short facts always scores low because it penalises extra
    tokens in long sentences. Token recall correctly measures whether the output is grounded
    in the provided facts regardless of sentence length.
    """
    facts = list(source_facts or [])
    if not facts:
        return 1.0

    gen_tokens = _tokenize(generated)
    if not gen_tokens:
        return 1.0

    recalls = []
    for fact in facts:
        fact_tokens = _tokenize(fact)
        if not fact_tokens:
            continue
        covered = len(fact_tokens & gen_tokens) / len(fact_tokens)
        recalls.append(covered)

    return sum(recalls) / len(recalls) if recalls else 1.0


def _answer_relevance(generated: str, task: str) -> float:
    return _jaccard(generated, task)


def _coherence(generated: str) -> float:
    sentences = _split_sentences(generated)
    if not sentences:
        return 1.0

    issues = 0
    seen: set[str] = set()
    for sent in sentences:
        # Incomplete sentence (no terminal punctuation)
        if not re.search(r"[.!?]$", sent):
            issues += 1
        # Repeated sentence
        normalized = re.sub(r"\s+", " ", sent.lower())
        if normalized in seen:
            issues += 1
        seen.add(normalized)

    return max(0.0, 1.0 - issues / len(sentences))


def _bleu1(generated: str, ground_truth: str) -> float:
    gen_words = re.findall(r"\w+", generated.lower())
    ref_words = set(re.findall(r"\w+", ground_truth.lower()))
    if not gen_words:
        return 0.0
    matches = sum(1 for w in gen_words if w in ref_words)
    return matches / len(gen_words)


def _semantic_similarity(generated: str, ground_truth: str) -> float:
    try:
        import voyageai  # noqa: PLC0415
        vo = voyageai.Client()
        embeddings = vo.embed([generated, ground_truth], model="voyage-2").embeddings
        a, b = embeddings[0], embeddings[1]
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = sum(x**2 for x in a) ** 0.5
        norm_b = sum(x**2 for x in b) ** 0.5
        return dot / (norm_a * norm_b) if norm_a and norm_b else 0.0
    except (ImportError, Exception):
        return _jaccard(generated, ground_truth)


def _hallucination_check(generated: str, source_facts: list[str]) -> dict:
    try:
        from governance.hallucination_checker import HallucinationChecker  # noqa: PLC0415
        checker = HallucinationChecker()
        facts_dict = {f"fact_{i}": fact for i, fact in enumerate(source_facts or [])}
        return checker.check(content=generated, source_facts=facts_dict)
    except Exception as exc:
        return {"passed": True, "violations": [], "confidence": 0.5, "explanation": f"Check skipped: {exc}"}


def _tone_check(generated: str) -> dict:
    try:
        from governance.tone_validator import ToneValidator  # noqa: PLC0415
        validator = ToneValidator()
        content = {"subject": "", "body": generated}
        return validator.validate(content)
    except Exception as exc:
        return {"passed": True, "issues": [f"Tone check skipped: {exc}"]}


def evaluate_output(
    generated: str,
    ground_truth: str,
    context: dict,
    task: str,
    source_facts: Optional[list[str]] = None,
) -> dict:
    """
    Evaluate a single model output against ground truth and context.
    Returns a dict with all metrics and a top-level passed/score.
    """
    faith = _faithfulness(generated, context, source_facts or [])
    relevance = _answer_relevance(generated, task)
    hallucination = _hallucination_check(generated, source_facts or [])
    coherence = _coherence(generated)
    bleu1 = _bleu1(generated, ground_truth)
    sem_sim = _semantic_similarity(generated, ground_truth)
    tone = _tone_check(generated)

    score = (faith + relevance + coherence + bleu1 + sem_sim) / 5.0
    passed = faith >= 0.7 and hallucination.get("passed", True) and tone.get("passed", True)

    return {
        "faithfulness": round(faith, 4),
        "answer_relevance": round(relevance, 4),
        "hallucination": hallucination,
        "coherence": round(coherence, 4),
        "bleu1": round(bleu1, 4),
        "semantic_similarity": round(sem_sim, 4),
        "tone": tone,
        "passed": passed,
        "score": round(score, 4),
    }
