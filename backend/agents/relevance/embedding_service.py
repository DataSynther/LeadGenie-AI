import os
import numpy as np
from anthropic import Anthropic

client = Anthropic()


class EmbeddingService:
    """Generates text embeddings using Voyage AI via Anthropic."""

    def embed_text(self, text: str) -> list[float]:
        """Return embedding vector for a given text string."""
        import voyageai
        vo = voyageai.Client(api_key=os.getenv("VOYAGE_API_KEY"))
        result = vo.embed([text], model="voyage-3")
        return result.embeddings[0]

    def cosine_similarity(self, a: list[float], b: list[float]) -> float:
        """Compute cosine similarity between two embedding vectors."""
        va, vb = np.array(a), np.array(b)
        norm = np.linalg.norm(va) * np.linalg.norm(vb)
        if norm == 0:
            return 0.0
        return float(np.dot(va, vb) / norm)

    def batch_embed(self, texts: list[str]) -> list[list[float]]:
        """Embed a list of texts in a single API call."""
        import voyageai
        vo = voyageai.Client(api_key=os.getenv("VOYAGE_API_KEY"))
        result = vo.embed(texts, model="voyage-3")
        return result.embeddings
