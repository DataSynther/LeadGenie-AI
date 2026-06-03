"""Retrieval policy: metadata_filter → relevance_score → threshold.

Bad:  vector_search(query) → top_k (no filtering, injects noise into context)
Good: metadata_filter → vector_search → rerank → threshold (only relevant facts enter context)

If no result clears the threshold, return zero — never pad context with noise.
"""

from __future__ import annotations

RELEVANCE_THRESHOLD = 0.40  # below this → dropped, not injected into context


class RetrievalPolicy:
    def __init__(self, threshold: float = RELEVANCE_THRESHOLD):
        self.threshold = threshold

    def filter_and_rank(
        self,
        query: str,
        memories: list[dict],
        lead_id: str | None = None,
        memory_type: str | None = None,
    ) -> dict:
        """
        Step 1: namespace / metadata filter
        Step 2: relevance score each candidate
        Step 3: drop below threshold — never pad with noise

        Returns:
            retrieved (int): candidates after metadata filter
            accepted  (int): cleared threshold
            rejected  (int): dropped below threshold
            results  (list): accepted memories, ranked by score desc
        """
        # 1. Metadata filter (namespace isolation)
        candidates = memories
        if lead_id:
            candidates = [
                m for m in candidates
                if m.get("lead_id") == lead_id or m.get("scope") == "__system__"
            ]
        if memory_type:
            candidates = [m for m in candidates if m.get("memory_type") == memory_type]

        retrieved = len(candidates)

        # 2. Score
        scored = [(m, self._score(query, m)) for m in candidates]

        # 3. Threshold
        accepted = sorted([(m, s) for m, s in scored if s >= self.threshold], key=lambda x: x[1], reverse=True)
        rejected = [(m, s) for m, s in scored if s < self.threshold]

        return {
            "retrieved": retrieved,
            "accepted":  len(accepted),
            "rejected":  len(rejected),
            "results":   [m for m, _ in accepted],
        }

    # ── scoring (MVP: token overlap; production: cosine similarity) ───────────

    def _score(self, query: str, memory: dict) -> float:
        # Include the key/field name so that e.g. "tech_stack" matches a "technology" query
        key = str(memory.get("key") or memory.get("field") or memory.get("fact_type") or "")
        content = str(
            memory.get("content")
            or memory.get("fact")
            or memory.get("value")
            or ""
        )
        combined = f"{key} {content}".strip()
        if not combined:
            return 0.0

        q_tokens = set(query.lower().split())
        c_tokens = set(combined.lower().replace("_", " ").split())
        if not q_tokens or not c_tokens:
            return 0.30

        overlap = len(q_tokens & c_tokens) / len(q_tokens | c_tokens)
        return min(0.30 + overlap * 1.4, 1.0)
