"""Memory Governance — orchestrates Write / Retrieval / Decay / Protection policies.

Architecture:
  Conversation Agent
        ↓
  Memory Governance Layer (this module)
    ├── Write Policy     → reject noise, enforce relevance threshold
    ├── Retrieval Policy → metadata filter → score → threshold
    ├── Decay Policy     → half-life scoring, stale detection
    └── Protection Policy→ tenant isolation, namespace boundaries
        ↓
  Memory Stores (EpisodicMemory, SemanticMemory, EntityMemory, ShortTermMemory)
"""

from __future__ import annotations
from .write_policy      import WritePolicy
from .retrieval_policy  import RetrievalPolicy
from .decay_policy      import DecayPolicy
from .protection_policy import ProtectionPolicy
from .event_store       import MemoryEventStore


class MemoryGovernance:
    """Singleton; imported by MemoryManager to gate every read/write."""

    def __init__(self) -> None:
        self.write_policy      = WritePolicy()
        self.retrieval_policy  = RetrievalPolicy()
        self.decay_policy      = DecayPolicy()
        self.protection_policy = ProtectionPolicy()
        self.events            = MemoryEventStore()

    # ── Governed Write ────────────────────────────────────────────────────────

    def governed_write(
        self,
        content: str,
        memory_type: str,
        lead_id: str,
        writer_scope: str = "__system__",
    ) -> dict:
        """Gate a memory write through protection then write policy.

        Returns {'written': bool, 'reason': str, 'relevance_score': float}
        Always records the decision for the dashboard.
        """
        # 1. Protection check
        prot = self.protection_policy.validate_write(lead_id, writer_scope)
        if not prot["allowed"]:
            self.events.record_protection(lead_id, "write_attempt", writer_scope, False)
            self.events.record_write(lead_id, memory_type, False, prot["reason"], 0.0)
            return {"written": False, "reason": prot["reason"], "relevance_score": 0.0}

        # 2. Write policy check
        wp = self.write_policy.evaluate(content, memory_type)
        self.events.record_write(lead_id, memory_type, wp["allowed"], wp["reason"], wp["relevance_score"])
        if not wp["allowed"]:
            return {"written": False, "reason": wp["reason"], "relevance_score": wp["relevance_score"]}

        return {"written": True, "reason": "approved", "relevance_score": wp["relevance_score"]}

    # ── Governed Retrieve ─────────────────────────────────────────────────────

    def governed_retrieve(
        self,
        query: str,
        memories: list[dict],
        lead_id: str,
        reader_scope: str = "__system__",
        memory_type: str | None = None,
    ) -> list[dict]:
        """Gate a retrieval through protection then retrieval policy.

        Returns only memories that cleared the relevance threshold.
        Irrelevant memory is worse than no memory — pulls reasoning sideways.
        """
        # 1. Protection check
        prot = self.protection_policy.validate_read(lead_id, reader_scope)
        if not prot["allowed"]:
            self.events.record_protection(lead_id, "read_attempt", reader_scope, False)
            return []

        # 2. Filter + rank + threshold
        result = self.retrieval_policy.filter_and_rank(query, memories, lead_id, memory_type)
        self.events.record_retrieval(
            lead_id, result["retrieved"], result["accepted"], result["rejected"]
        )
        return result["results"]

    # ── Decay Scan ────────────────────────────────────────────────────────────

    def run_decay_scan(self, memories: list[dict], lead_id: str = "scan") -> dict:
        """Classify memories as expired/stale/healthy and record decay events."""
        report = self.decay_policy.scan(memories)

        for m in report["expired"]:
            self.events.record_decay(
                lead_id, "expired",
                m.get("fact_type", m.get("memory_type", "unknown")),
                m.get("_effective_score", 0.0),
            )
        for m in report["stale"]:
            self.events.record_decay(
                lead_id, "stale",
                m.get("fact_type", m.get("memory_type", "unknown")),
                m.get("_effective_score", 0.0),
            )
        return report

    # ── Stats ─────────────────────────────────────────────────────────────────

    def get_stats(self) -> dict:
        return self.events.get_stats()


# Module-level singleton — import this everywhere
governance = MemoryGovernance()
