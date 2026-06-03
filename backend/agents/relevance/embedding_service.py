from __future__ import annotations
import os
import time
import math
import numpy as np
from typing import Optional

_VOYAGE_MODEL = "voyage-3"
_MAX_RETRIES  = 4
_BASE_SLEEP   = 22   # seconds — 3 RPM free tier: 1 call every ~20s


class EmbeddingService:
    """Generates text embeddings using Voyage AI.

    Retries automatically on rate-limit errors (3 RPM free-tier cap).
    Falls back to a lightweight TF-IDF-style bag-of-words vector when
    VoyageAI is unavailable (no API key, quota exhausted after retries).
    """

    def _client(self):
        import voyageai
        return voyageai.Client(api_key=os.getenv("VOYAGE_API_KEY"))

    def _voyage_embed(self, texts: list[str]) -> Optional[list[list[float]]]:
        """Call VoyageAI with exponential-backoff retry on rate-limit."""
        try:
            import voyageai
        except ImportError:
            return None

        key = os.getenv("VOYAGE_API_KEY")
        if not key:
            return None

        vo  = voyageai.Client(api_key=key)
        for attempt in range(_MAX_RETRIES):
            try:
                return vo.embed(texts, model=_VOYAGE_MODEL).embeddings
            except Exception as exc:
                msg = str(exc).lower()
                if "rate" in msg or "429" in msg or "quota" in msg:
                    sleep = _BASE_SLEEP * (2 ** attempt)
                    time.sleep(sleep)
                else:
                    break   # non-rate-limit error — fall through to fallback
        return None

    # ── keyword fallback (used when VoyageAI is unavailable) ─────────────────

    def _bow_vector(self, text: str, vocab: dict[str, int], dim: int) -> list[float]:
        vec = [0.0] * dim
        tokens = text.lower().split()
        for tok in tokens:
            if tok in vocab:
                vec[vocab[tok]] += 1.0
        norm = math.sqrt(sum(x * x for x in vec)) or 1.0
        return [x / norm for x in vec]

    def _fallback_embed(self, texts: list[str]) -> list[list[float]]:
        all_tokens: list[str] = []
        for t in texts:
            all_tokens.extend(t.lower().split())
        vocab = {tok: i for i, tok in enumerate(dict.fromkeys(all_tokens))}
        dim   = max(len(vocab), 1)
        return [self._bow_vector(t, vocab, dim) for t in texts]

    # ── public API ────────────────────────────────────────────────────────────

    def embed_text(self, text: str) -> list[float]:
        result = self._voyage_embed([text])
        if result:
            return result[0]
        return self._fallback_embed([text])[0]

    def batch_embed(self, texts: list[str]) -> list[list[float]]:
        result = self._voyage_embed(texts)
        if result:
            return result
        return self._fallback_embed(texts)

    def cosine_similarity(self, a: list[float], b: list[float]) -> float:
        len_a, len_b = len(a), len(b)
        if len_a != len_b:
            # Pad shorter vector to match dimensions (fallback may differ in dim)
            if len_a < len_b:
                a = a + [0.0] * (len_b - len_a)
            else:
                b = b + [0.0] * (len_a - len_b)
        va, vb = np.array(a), np.array(b)
        norm = np.linalg.norm(va) * np.linalg.norm(vb)
        if norm == 0:
            return 0.0
        return float(np.dot(va, vb) / norm)
