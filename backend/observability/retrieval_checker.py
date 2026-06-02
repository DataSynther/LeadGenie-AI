"""Measures how well generated content is grounded in the source context.

Returns retrieval_score 0.0–1.0:
  1.0 = every claim directly supported by context
  0.0 = claims disconnected from context (likely hallucinated)

Method:
  1. Split generated text into individual claims (sentences)
  2. Extract all meaningful text chunks from the context object
  3. Batch-embed both lists in ONE Voyage AI call (reuses existing EmbeddingService)
  4. For each claim, find the max cosine similarity to any context chunk
  5. Return the mean of those per-claim max similarities

Falls back to word-level Jaccard similarity if embeddings are unavailable
(Voyage rate limit, missing API key, or network error). Jaccard is weaker
but never blocks the pipeline.
"""
import re
import logging
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

RETRIEVAL_FAILURE_THRESHOLD = 0.55   # imported by agent_tracer


def _extract_claims(text: str) -> list:
    """Split text into individual sentences that are long enough to be claims."""
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    return [s.strip() for s in sentences if len(s.strip()) > 20]


def _context_to_chunks(context: dict) -> list:
    """Flatten all populated context fields into a list of text chunks."""
    chunks = []

    lead = context.get("lead") or {}
    company = context.get("company") or {}
    research = context.get("research") or {}
    signals = context.get("signals") or {}

    if lead.get("name") or lead.get("title"):
        chunks.append(
            f"{lead.get('name', '')} is {lead.get('title', '')} at {company.get('name', '')}"
        )

    if company.get("description"):
        chunks.append(company["description"])
    if company.get("industry"):
        chunks.append(f"Industry: {company['industry']}")
    if company.get("employee_count"):
        chunks.append(f"Employees: {company['employee_count']}")
    if company.get("technologies"):
        chunks.append("Tech stack: " + ", ".join(company["technologies"][:10]))
    if company.get("revenue_estimate"):
        chunks.append(f"Revenue: {company['revenue_estimate']}")

    if research.get("summary"):
        chunks.append(research["summary"])
    for item in research.get("pain_points", []):
        if item:
            chunks.append(str(item))
    for item in research.get("strategic_priorities", []):
        if item:
            chunks.append(str(item))
    if research.get("growth_stage"):
        chunks.append(f"Growth stage: {research['growth_stage']}")
    if research.get("ai_readiness_score") is not None:
        chunks.append(f"AI readiness score: {research['ai_readiness_score']}/10")

    for k, v in signals.items():
        if v and isinstance(v, (str, int, float, bool)):
            chunks.append(f"{k}: {v}")

    return [c for c in chunks if c and len(c.strip()) > 5]


def _cosine(a: list, b: list) -> float:
    va, vb = np.array(a), np.array(b)
    norm = np.linalg.norm(va) * np.linalg.norm(vb)
    return float(np.dot(va, vb) / norm) if norm > 0 else 0.0


def _jaccard(text_a: str, text_b: str) -> float:
    words_a = set(re.findall(r"\b\w{3,}\b", text_a.lower()))
    words_b = set(re.findall(r"\b\w{3,}\b", text_b.lower()))
    if not words_a or not words_b:
        return 0.0
    return len(words_a & words_b) / len(words_a | words_b)


def compute_retrieval_score(generated_text: str, context: dict) -> Optional[float]:
    """
    Return grounding score 0.0–1.0.  None if both methods unavailable.

    Low score means the generated text contains claims not supported by context,
    which is a strong signal of retrieval failure or hallucination.
    """
    claims = _extract_claims(generated_text)
    chunks = _context_to_chunks(context)

    if not claims or not chunks:
        return None

    # ── Attempt embedding-based similarity ───────────────────────────────────
    try:
        import os
        import voyageai
        api_key = os.getenv("VOYAGE_API_KEY")
        if api_key:
            vo = voyageai.Client(api_key=api_key)
            all_texts = claims + chunks
            result = vo.embed(all_texts, model="voyage-3")
            embeddings = result.embeddings

            claim_embs = embeddings[: len(claims)]
            chunk_embs = embeddings[len(claims) :]

            per_claim_max = [
                max(_cosine(ce, ctx_e) for ctx_e in chunk_embs)
                for ce in claim_embs
            ]
            score = round(sum(per_claim_max) / len(per_claim_max), 3)
            logger.debug("Retrieval score (embeddings): %.3f for %d claims", score, len(claims))
            return score
    except Exception as exc:
        logger.debug("Embedding retrieval check failed (%s), using Jaccard fallback", exc)

    # ── Jaccard fallback (no API calls) ──────────────────────────────────────
    context_text = " ".join(chunks)
    per_claim_max = [
        max(_jaccard(claim, chunk) for chunk in chunks)
        for claim in claims
    ]
    score = round(sum(per_claim_max) / len(per_claim_max), 3)
    logger.debug("Retrieval score (Jaccard fallback): %.3f", score)
    return score
