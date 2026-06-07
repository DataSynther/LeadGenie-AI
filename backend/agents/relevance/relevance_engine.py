from __future__ import annotations
import hashlib
import json
from pathlib import Path
from .embedding_service import EmbeddingService

_CACHE_DIR = Path(__file__).parent / "__embedding_cache__"
_CACHE_DIR.mkdir(exist_ok=True)


def _cache_key(texts: list[str]) -> str:
    return hashlib.md5("|".join(texts).encode()).hexdigest()


def _load_cache(key: str) -> list[list[float]] | None:
    path = _CACHE_DIR / f"{key}.json"
    if path.exists():
        return json.loads(path.read_text())
    return None


def _save_cache(key: str, embeddings: list[list[float]]) -> None:
    path = _CACHE_DIR / f"{key}.json"
    path.write_text(json.dumps(embeddings))


class RelevanceEngine:
    """Ranks market trends by semantic similarity to lead and company context."""

    def __init__(self):
        self.embedder = EmbeddingService()

    def rank_trends(self, context: dict, trends: list[dict], top_k: int = 3) -> list[dict]:
        """Return top_k trends most relevant to the given lead/company context.

        Uses a single Voyage AI batch call (context + all trends together) to
        avoid hitting the 3 RPM free-tier rate limit that caused >60s waits when
        two separate embed calls were made back-to-back.

        Trend embeddings are cached to disk by content hash — repeat runs with the
        same trend list skip the Voyage call entirely for the trend side.
        """
        context_text = self._context_to_text(context)
        trend_texts = [
            t.get("title", "") + " " + " ".join(t.get("relevance_tags", []))
            for t in trends
        ]

        # Check if trend embeddings are cached
        trend_cache_key = _cache_key(trend_texts)
        cached_trend_embeddings = _load_cache(trend_cache_key)

        if cached_trend_embeddings:
            # Trends are cached — only embed the context (1 small call)
            context_embedding = self.embedder.embed_text(context_text)
            trend_embeddings = cached_trend_embeddings
        else:
            # Batch context + all trends in ONE API call (was previously 2 calls)
            all_embeddings = self.embedder.batch_embed([context_text] + trend_texts)
            context_embedding = all_embeddings[0]
            trend_embeddings = all_embeddings[1:]
            _save_cache(trend_cache_key, trend_embeddings)

        scored = [
            {**trend, "relevance_score": round(self.embedder.cosine_similarity(context_embedding, emb), 4)}
            for trend, emb in zip(trends, trend_embeddings)
        ]
        scored.sort(key=lambda x: x["relevance_score"], reverse=True)
        return scored[:top_k]

    def score_relevance(self, context: dict, trend: dict) -> float:
        """Return a single relevance score for one trend against context."""
        context_text = self._context_to_text(context)
        trend_text = trend.get("title", "") + " " + " ".join(trend.get("relevance_tags", []))
        # Batch both in one call to avoid triggering rate-limit between two calls
        embeddings = self.embedder.batch_embed([context_text, trend_text])
        return self.embedder.cosine_similarity(embeddings[0], embeddings[1])

    def _context_to_text(self, context: dict) -> str:
        parts = []
        if lead := context.get("lead"):
            parts.append(f"{lead.get('title')} at {context.get('company', {}).get('name')}")
        if company := context.get("company"):
            parts.append(company.get("description") or "")
            parts.extend(company.get("technologies", []))
        if research := context.get("research"):
            parts.extend(research.get("pain_points", []))
            parts.extend(research.get("strategic_priorities", []))
        return " ".join(filter(None, parts))
