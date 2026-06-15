"""
Layer 2 — Retrieval Evaluation
Measures how well the retrieval step surfaces relevant facts and how well
those facts are used in the final output. No model calls needed.
"""
import re


def jaccard(a: str, b: str) -> float:
    """Jaccard similarity between two strings, tokenized on whitespace+punctuation."""
    tokens_a = set(re.findall(r"\w+", a.lower()))
    tokens_b = set(re.findall(r"\w+", b.lower()))
    if not tokens_a and not tokens_b:
        return 1.0
    union = tokens_a | tokens_b
    return len(tokens_a & tokens_b) / len(union) if union else 0.0


def evaluate_retrieval(
    query: str,
    retrieved_facts: list[str],
    all_available_facts: list[str],
    generated_output: str,
    k: int = 3,
) -> dict:
    """
    Evaluate retrieval quality across 4 metrics.

    Args:
        query: The original search query / user intent.
        retrieved_facts: Facts returned by the retrieval step (ordered).
        all_available_facts: Full pool of facts that could have been retrieved.
        generated_output: Final model output (used to check utilization).
        k: Top-k cutoff for precision calculation.

    Returns dict with precision_at_k, recall, chunk_relevance, context_utilization, passed, k.
    """
    top_k = retrieved_facts[:k]

    # --- Precision@k ---------------------------------------------------------
    # How many of the top-k retrieved facts are actually reflected in the output?
    # For short facts vs long outputs, standard Jaccard underestimates presence
    # because the union grows with output length. We use token-containment:
    # a fact is "used" if ≥50% of its content tokens appear in the output.
    output_tokens = set(re.findall(r"\w+", generated_output.lower()))

    def _fact_in_output(fact: str) -> bool:
        fact_tokens = set(re.findall(r"\w+", fact.lower()))
        if not fact_tokens:
            return False
        overlap = len(fact_tokens & output_tokens)
        return (overlap / len(fact_tokens)) >= 0.5

    used_count = sum(1 for fact in top_k if _fact_in_output(fact))
    precision_at_k = used_count / k if k > 0 else 0.0

    # --- Recall --------------------------------------------------------------
    # Of all available facts relevant to the query, how many were retrieved?
    relevant_in_pool = [f for f in all_available_facts if jaccard(f, query) >= 0.2]
    if not relevant_in_pool:
        recall = 1.0  # nothing to retrieve → perfect by convention
    else:
        retrieved_set = set(retrieved_facts)
        relevant_retrieved = sum(
            1 for f in relevant_in_pool
            if any(jaccard(f, r) >= 0.3 for r in retrieved_set)
        )
        recall = relevant_retrieved / len(relevant_in_pool)

    # --- Chunk relevance -----------------------------------------------------
    per_fact = [round(jaccard(fact, query), 4) for fact in retrieved_facts]
    mean_relevance = sum(per_fact) / len(per_fact) if per_fact else 0.0

    # --- Context utilization -------------------------------------------------
    # What fraction of retrieved facts have meaningful overlap with the output?
    # Use the same token-containment approach but with a lower threshold (≥30%).
    if not retrieved_facts:
        context_utilization = 0.0
    else:
        def _fact_utilized(fact: str) -> bool:
            fact_tokens = set(re.findall(r"\w+", fact.lower()))
            if not fact_tokens:
                return False
            overlap = len(fact_tokens & output_tokens)
            return (overlap / len(fact_tokens)) >= 0.3

        utilized = sum(1 for fact in retrieved_facts if _fact_utilized(fact))
        context_utilization = utilized / len(retrieved_facts)

    passed = precision_at_k >= 0.6 and context_utilization >= 0.5

    return {
        "precision_at_k": round(precision_at_k, 4),
        "recall": round(recall, 4),
        "chunk_relevance": {
            "per_fact": per_fact,
            "mean": round(mean_relevance, 4),
        },
        "context_utilization": round(context_utilization, 4),
        "passed": passed,
        "k": k,
    }
