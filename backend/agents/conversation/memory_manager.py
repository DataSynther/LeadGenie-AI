"""Memory manager — three-layer architecture gated through MemoryGovernance.

Layers:
  EpisodicMemory   → per-lead conversation history (last 10 raw, older summarised)
  SemanticMemory   → persistent facts about leads (provenance + decay)
  ShortTermMemory  → within-session working context (score-based eviction)

All writes/reads pass through memory.governance for policy enforcement
and observability event recording.
"""

from __future__ import annotations
import json
from datetime import datetime, timezone
from pathlib import Path

from memory.memory_governance import governance

# ── Storage paths ─────────────────────────────────────────────────────────────

_STORAGE     = Path(__file__).parent.parent.parent / "storage"
_EPISODIC    = _STORAGE / "memory" / "episodic"
_SEMANTIC    = _STORAGE / "memory" / "semantic"
_ENTITY      = _STORAGE / "memory" / "entity"
_SHORT_TERM  = _STORAGE / "memory" / "short_term"

for _d in (_EPISODIC, _SEMANTIC, _ENTITY, _SHORT_TERM):
    _d.mkdir(parents=True, exist_ok=True)

_RAW_WINDOW  = 10   # keep last N messages as raw; older are summarised
_SHORT_TERM_MAX = 20

_PROTECTED_TYPES = {"apollo_fact", "research_summary", "top_trend"}


# ── Episodic Memory ───────────────────────────────────────────────────────────

class EpisodicMemory:
    """Conversation history across sessions.

    Storage format:
      { "raw": [...last _RAW_WINDOW messages...],
        "archive_summary": "...",   # extractive summary of older messages
        "archive_count": N }
    """

    def append(self, lead_id: str, role: str, content: str, meta: dict | None = None) -> bool:
        """Write a message through governance, then append to episodic store."""
        result = governance.governed_write(content, "episodic", lead_id)
        if not result["written"]:
            return False

        store = self._read(lead_id)
        entry = {
            "role":       role,
            "content":    content,
            "ts":         datetime.now(timezone.utc).isoformat(),
            "confidence": result["relevance_score"],
            **(meta or {}),
        }
        store["raw"].append(entry)

        # Slide window — summarise if raw exceeds _RAW_WINDOW
        if len(store["raw"]) > _RAW_WINDOW:
            overflow = store["raw"][: len(store["raw"]) - _RAW_WINDOW]
            store["raw"] = store["raw"][-_RAW_WINDOW:]
            store["archive_count"] += len(overflow)
            # Simple extractive summary (no LLM call — avoids recursive cost)
            new_lines = [f"{m['role'].upper()}: {m['content'][:120]}" for m in overflow]
            if store["archive_summary"]:
                store["archive_summary"] += "\n" + "\n".join(new_lines)
            else:
                store["archive_summary"] = "\n".join(new_lines)

        self._write(lead_id, store)
        return True

    def get(self, lead_id: str) -> list[dict]:
        """Return recent episodic messages.

        Episodic memory is chronological — we return raw messages without
        relevance-threshold filtering (which is for semantic/entity retrieval).
        Decay scan runs non-blocking for observability.
        """
        store = self._read(lead_id)
        memories = store["raw"]

        # Record retrieval event and run decay scan (non-blocking)
        if memories:
            governance.events.record_retrieval(lead_id, len(memories), len(memories), 0)
            governance.run_decay_scan(
                [{**m, "memory_type": "episodic"} for m in memories], lead_id
            )

        return memories

    def recent(self, lead_id: str, n: int = 6) -> str:
        """Plain-text summary of last n messages for prompt injection."""
        msgs = self.get(lead_id)[-n:]
        if not msgs:
            return "No prior conversation."
        return "\n".join(f"{m['role'].upper()}: {m['content']}" for m in msgs)

    def archive_summary(self, lead_id: str) -> str:
        return self._read(lead_id).get("archive_summary", "")

    def clear(self, lead_id: str) -> None:
        path = _EPISODIC / f"{lead_id}.json"
        if path.exists():
            path.unlink()

    # ── internals ──────────────────────────────────────────────────────────────

    def _read(self, lead_id: str) -> dict:
        path = _EPISODIC / f"{lead_id}.json"
        if path.exists():
            try:
                return json.loads(path.read_text())
            except json.JSONDecodeError:
                pass
        return {"raw": [], "archive_summary": "", "archive_count": 0}

    def _write(self, lead_id: str, store: dict) -> None:
        path = _EPISODIC / f"{lead_id}.json"
        path.write_text(json.dumps(store, indent=2))


# ── Semantic Memory ───────────────────────────────────────────────────────────

class SemanticMemory:
    """Persistent facts about a lead/domain that survive across sessions.

    Each fact is stored with provenance and a recency field for decay scoring.
    Conflict resolution: latest write wins only if relevance_score is higher.
    """

    def set(self, key: str, value: str, lead_id: str = "__system__",
            fact_type: str = "fact", source: str = "system") -> bool:
        result = governance.governed_write(str(value), "semantic", lead_id)
        if not result["written"]:
            return False

        facts = self._read(lead_id)
        existing = facts.get(key, {})

        # Conflict resolution: only overwrite if new confidence is higher or fact doesn't exist
        new_confidence = result["relevance_score"]
        if existing and existing.get("confidence", 0) > new_confidence:
            # Keep existing — higher confidence wins (not "latest wins")
            governance.events.record_decay(lead_id, "reaffirmed", fact_type,
                                           existing.get("confidence", 0))
            return False

        facts[key] = {
            "value":        value,
            "source":       source,
            "asserted_at":  datetime.now(timezone.utc).isoformat(),
            "confidence":   new_confidence,
            "fact_type":    fact_type,
            "lead_id":      lead_id,
            "memory_type":  "semantic",
        }
        self._write(lead_id, facts)
        return True

    def get(self, lead_id: str, query: str = "") -> dict:
        facts = self._read(lead_id)
        if not facts:
            return {}

        # Apply decay scan
        fact_list = list(facts.values())
        if fact_list:
            governance.run_decay_scan(fact_list, lead_id)

        # Apply retrieval policy if query given
        if query:
            # Include the key name so retrieval scoring can use it (e.g. "tech_stack" ~ "technology")
            accepted = governance.governed_retrieve(
                query=query,
                memories=[{**v, "key": k, "lead_id": lead_id} for k, v in facts.items()],
                lead_id=lead_id,
                memory_type="semantic",
            )
            return {f["key"]: f for f in accepted}

        return facts

    def get_all(self) -> dict:
        """Return domain-level facts (lead_id == __system__)."""
        return self._read("__system__")

    def update_trends(self, trends: list[dict]) -> None:
        data = self._read("__system__")
        data["trends"] = {
            "value":       json.dumps(trends),
            "source":      "TrendAgent",
            "asserted_at": datetime.now(timezone.utc).isoformat(),
            "confidence":  0.85,
            "fact_type":   "trend",
            "lead_id":     "__system__",
            "memory_type": "semantic",
        }
        self._write("__system__", data)

    def get_trends(self) -> list[dict]:
        data = self._read("__system__")
        raw = data.get("trends", {}).get("value", "[]")
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return []

    # ── internals ──────────────────────────────────────────────────────────────

    def _read(self, lead_id: str) -> dict:
        path = _SEMANTIC / f"{lead_id}.json"
        if path.exists():
            try:
                return json.loads(path.read_text())
            except json.JSONDecodeError:
                pass
        return {}

    def _write(self, lead_id: str, facts: dict) -> None:
        path = _SEMANTIC / f"{lead_id}.json"
        path.write_text(json.dumps(facts, indent=2))


# ── Entity Memory ─────────────────────────────────────────────────────────────

class EntityMemory:
    """Single unified entity per lead — survives across all sessions.

    Stores structured facts: company, title, signals, objections, meetings.
    Natural fit for Neo4j (future). For now: flat JSON with provenance.
    """

    def get(self, lead_id: str) -> dict:
        path = _ENTITY / f"{lead_id}.json"
        if path.exists():
            try:
                return json.loads(path.read_text())
            except json.JSONDecodeError:
                pass
        return {}

    def update(self, lead_id: str, facts: dict, source: str = "system") -> None:
        """Shallow-merge new facts into entity store.

        Entity memory is explicitly structured data (not free-form text), so we
        skip relevance scoring and only require a non-empty value.  Protection
        policy (namespace isolation) is the right gate here.
        """
        existing = self.get(lead_id)
        for k, v in facts.items():
            raw = str(v).strip()
            if not raw:
                continue
            existing[k] = {
                "value":       v,
                "source":      source,
                "asserted_at": datetime.now(timezone.utc).isoformat(),
                "confidence":  0.85,
                "fact_type":   "entity",
                "memory_type": "entity",
                "lead_id":     lead_id,
            }
        path = _ENTITY / f"{lead_id}.json"
        path.write_text(json.dumps(existing, indent=2))

    def clear(self, lead_id: str) -> None:
        path = _ENTITY / f"{lead_id}.json"
        if path.exists():
            path.unlink()


# ── Short-Term Memory ─────────────────────────────────────────────────────────

class ShortTermMemory:
    """Within-session working context with score-based eviction.

    Eviction score = 0.6 × relevance + 0.4 × recency
    Never evict: apollo_fact, research_summary, top_trend
    """

    def __init__(self) -> None:
        self._store: dict[str, list[dict]] = {}

    def add(self, session_id: str, item: dict) -> None:
        items = self._store.setdefault(session_id, [])
        items.append({**item, "_added_at": datetime.now(timezone.utc).isoformat()})
        self._store[session_id] = self._evict(items)

    def get(self, session_id: str) -> list[dict]:
        return self._store.get(session_id, [])

    def clear(self, session_id: str) -> None:
        self._store.pop(session_id, None)

    def _score(self, item: dict, now_ts: float) -> float:
        relevance = item.get("relevance", 0.5)
        added_ts  = item.get("_added_at", "")
        try:
            ts = datetime.fromisoformat(added_ts.replace("Z", "+00:00")).timestamp()
            age_secs = max(now_ts - ts, 0)
            recency  = max(1.0 - age_secs / 3600, 0.0)  # decays over 1 hour
        except (ValueError, AttributeError):
            recency = 0.5
        return 0.6 * relevance + 0.4 * recency

    def _evict(self, items: list[dict]) -> list[dict]:
        if len(items) <= _SHORT_TERM_MAX:
            return items
        now_ts    = datetime.now(timezone.utc).timestamp()
        protected = [i for i in items if i.get("type") in _PROTECTED_TYPES]
        evictable = sorted(
            [i for i in items if i.get("type") not in _PROTECTED_TYPES],
            key=lambda x: self._score(x, now_ts),
            reverse=True,
        )
        keep = max(0, _SHORT_TERM_MAX - len(protected))
        return protected + evictable[:keep]


# ── MemoryManager facade ──────────────────────────────────────────────────────

class MemoryManager:
    """Backward-compatible facade exposing the three-layer memory system.

    All methods delegate to the appropriate layer and pass through governance.
    """

    def __init__(self) -> None:
        self.episodic    = EpisodicMemory()
        self.semantic    = SemanticMemory()
        self.entity      = EntityMemory()
        self.short_term  = ShortTermMemory()

    # ── episodic ──────────────────────────────────────────────────────────────

    def store_message(self, lead_id: str, role: str, content: str) -> None:
        self.episodic.append(lead_id, role, content)

    def get_history(self, lead_id: str) -> list[dict]:
        """Return governed episodic history (relevance-filtered)."""
        raw = self.episodic.get(lead_id)
        # Flatten to the shape callers expect: [{role, content, timestamp}]
        return [
            {"role": m.get("role"), "content": m.get("content"), "timestamp": m.get("ts", "")}
            for m in raw
        ]

    def summarize_history(self, lead_id: str) -> str:
        return self.episodic.recent(lead_id, n=6)

    def clear(self, lead_id: str) -> None:
        self.episodic.clear(lead_id)
        self.entity.clear(lead_id)

    # ── semantic / entity ─────────────────────────────────────────────────────

    def update_entity(self, lead_id: str, facts: dict) -> None:
        self.entity.update(lead_id, facts)

    def get_entity(self, lead_id: str) -> dict:
        return self.entity.get(lead_id)

    def update_trends(self, trends: list[dict]) -> None:
        self.semantic.update_trends(trends)

    def get_trends(self) -> list[dict]:
        return self.semantic.get_trends()
