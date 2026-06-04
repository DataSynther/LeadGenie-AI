"""Sender knowledge base — curated facts about Ganit for use in outreach.

Records are stored in storage/knowledge_base/{vertical}.jsonl and are
treated as Domain B (cite exactly, never embellish). They are NOT governed
by MemoryGovernance because they are source-of-truth, not inferred.

Retrieval scoring:
  vertical_match   0.40   exact vertical match
  domain_match     0.30   exact domain match (generic domain scores 0.15)
  tech_overlap     0.10 each, max 0.20   intersection with lead's tech stack
  generic_bonus    0.05   record domain == "generic" always gets this bonus
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

STORE_DIR = Path(__file__).parent.parent / "storage" / "knowledge_base"


class SenderKnowledgeBase:
    """Read-only access to curated sender claims, with tag-scored retrieval."""

    def __init__(self) -> None:
        self._records: list[dict] = []
        self._by_id: dict[str, dict] = {}
        self._load()

    def _load(self) -> None:
        if not STORE_DIR.exists():
            return
        for path in STORE_DIR.glob("*.jsonl"):
            with open(path) as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        rec = json.loads(line)
                        self._records.append(rec)
                        self._by_id[rec["id"]] = rec
                    except (json.JSONDecodeError, KeyError):
                        pass

    def retrieve(
        self,
        vertical: str,
        domain: str = "generic",
        technologies: Optional[list[str]] = None,
        category: Optional[str] = None,
        trend_tags: Optional[list[str]] = None,
        n: int = 3,
    ) -> list[dict]:
        """Return up to n records ranked by relevance to the given context.

        Scoring weights:
          vertical_match   0.40
          domain_match     0.30  (generic domain scores 0.15)
          tech_overlap     0.10 each, max 0.20
          generic_bonus    0.05  always for generic-domain records
          trend_overlap    0.05 each, max 0.10  keyword match vs trend tags

        Args:
            vertical:     lead's vertical (data_engineering, data_science, etc.)
            domain:       lead's industry domain (fintech, ecommerce, etc.)
            technologies: tech stack tags from lead/company context
            category:     filter to a specific KB category (case_study, capability, etc.)
            trend_tags:   relevance_tags from the top trend (e.g. ["ai", "cost", "cloud"])
            n:            max records to return
        """
        tech_set = {t.lower() for t in (technologies or [])}
        trend_set = {t.lower() for t in (trend_tags or [])}
        scored: list[tuple[float, dict]] = []

        for rec in self._records:
            if category and rec.get("category") != category:
                continue

            score = 0.0

            if rec.get("vertical") == vertical:
                score += 0.40
            elif rec.get("vertical") == "generic":
                score += 0.10

            rec_domain = rec.get("domain", "generic")
            if rec_domain == domain:
                score += 0.30
            elif rec_domain == "generic":
                score += 0.15

            rec_techs = {t.lower() for t in (rec.get("technologies") or [])}
            score += min(len(rec_techs & tech_set) * 0.10, 0.20)

            if rec_domain == "generic":
                score += 0.05

            if trend_set:
                claim_words = set((rec.get("claim") or "").lower().split())
                rec_tags = rec_techs | claim_words
                score += min(len(trend_set & rec_tags) * 0.05, 0.10)

            scored.append((score, rec))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [rec for _, rec in scored[:n]]

    def get_by_ids(self, ids: list[str]) -> list[dict]:
        """Fetch specific records by ID — used by the hallucination checker."""
        return [self._by_id[i] for i in ids if i in self._by_id]

    def all_records(self) -> list[dict]:
        return list(self._records)

    def get_claims_text(self, ids: list[str]) -> str:
        """Return a formatted text block of claims for prompt injection."""
        records = self.get_by_ids(ids)
        if not records:
            return ""
        lines = []
        for rec in records:
            metric = f" [{rec['metric']}]" if rec.get("metric") else ""
            lines.append(f"- [{rec['id']}] {rec['claim']}{metric}")
        return "\n".join(lines)
