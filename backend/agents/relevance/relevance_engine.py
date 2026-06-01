from .embedding_service import EmbeddingService


class RelevanceEngine:
    """Ranks market trends by semantic similarity to lead and company context."""

    def __init__(self):
        self.embedder = EmbeddingService()

    def rank_trends(self, context: dict, trends: list[dict], top_k: int = 3) -> list[dict]:
        """Return top_k trends most relevant to the given lead/company context."""
        context_text = self._context_to_text(context)
        trend_texts = [t.get("title", "") + " " + " ".join(t.get("relevance_tags", [])) for t in trends]

        context_embedding = self.embedder.embed_text(context_text)
        trend_embeddings = self.embedder.batch_embed(trend_texts)

        scored = []
        for trend, embedding in zip(trends, trend_embeddings):
            score = self.embedder.cosine_similarity(context_embedding, embedding)
            scored.append({**trend, "relevance_score": round(score, 4)})

        scored.sort(key=lambda x: x["relevance_score"], reverse=True)
        return scored[:top_k]

    def score_relevance(self, context: dict, trend: dict) -> float:
        """Return a single relevance score for one trend against context."""
        context_text = self._context_to_text(context)
        trend_text = trend.get("title", "") + " " + " ".join(trend.get("relevance_tags", []))
        a = self.embedder.embed_text(context_text)
        b = self.embedder.embed_text(trend_text)
        return self.embedder.cosine_similarity(a, b)

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
