"""
Three-layer memory system for per-lead conversations.

  EntityMemory   – structured facts about a lead / company (name, role, signals…)
  EpisodicMemory – timestamped interaction log (messages sent / received)
  SemanticMemory – shared domain knowledge that informs all leads (trends, facts)

MemoryManager orchestrates all three and provides the same public API that the
conversation_agent expects (store_message / get_history / summarize_history / clear).
"""
import json
from datetime import datetime
from pathlib import Path
from typing import Any

_BASE = Path(__file__).parent.parent.parent / "storage" / "memory"

ENTITY_DIR   = _BASE / "entity"
EPISODIC_DIR = _BASE / "episodic"
SEMANTIC_DIR = _BASE / "semantic"

for _d in (ENTITY_DIR, EPISODIC_DIR, SEMANTIC_DIR):
    _d.mkdir(parents=True, exist_ok=True)


# ── helpers ────────────────────────────────────────────────────────────────────

def _load(path: Path) -> Any:
    if not path.exists():
        return None
    with open(path) as f:
        return json.load(f)


def _save(path: Path, data: Any) -> None:
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


# ── EntityMemory ───────────────────────────────────────────────────────────────

class EntityMemory:
    """Structured facts about a specific lead/company. Mutable, keyed by field."""

    def get(self, lead_id: str) -> dict:
        return _load(ENTITY_DIR / f"{lead_id}.json") or {}

    def update(self, lead_id: str, facts: dict) -> None:
        """Merge `facts` into stored entity data (shallow merge, new keys win)."""
        current = self.get(lead_id)
        current.update(facts)
        current["_updated_at"] = datetime.utcnow().isoformat()
        _save(ENTITY_DIR / f"{lead_id}.json", current)

    def clear(self, lead_id: str) -> None:
        path = ENTITY_DIR / f"{lead_id}.json"
        if path.exists():
            path.unlink()


# ── EpisodicMemory ─────────────────────────────────────────────────────────────

class EpisodicMemory:
    """Timestamped interaction log — each entry is one message or event."""

    def append(self, lead_id: str, role: str, content: str, meta: dict | None = None) -> None:
        history = self.get(lead_id)
        entry: dict = {
            "role": role,
            "content": content,
            "timestamp": datetime.utcnow().isoformat(),
        }
        if meta:
            entry["meta"] = meta
        history.append(entry)
        _save(EPISODIC_DIR / f"{lead_id}.json", history)

    def get(self, lead_id: str) -> list[dict]:
        return _load(EPISODIC_DIR / f"{lead_id}.json") or []

    def recent(self, lead_id: str, n: int = 6) -> list[dict]:
        return self.get(lead_id)[-n:]

    def clear(self, lead_id: str) -> None:
        path = EPISODIC_DIR / f"{lead_id}.json"
        if path.exists():
            path.unlink()


# ── SemanticMemory ─────────────────────────────────────────────────────────────

class SemanticMemory:
    """Shared domain knowledge (industry trends, product facts, objection patterns).
    Not per-lead — one store for the whole instance."""

    _PATH = SEMANTIC_DIR / "domain.json"

    def get_all(self) -> dict:
        return _load(self._PATH) or {}

    def get(self, key: str) -> Any:
        return self.get_all().get(key)

    def set(self, key: str, value: Any) -> None:
        store = self.get_all()
        store[key] = value
        store["_updated_at"] = datetime.utcnow().isoformat()
        _save(self._PATH, store)

    def update_trends(self, trends: list[dict]) -> None:
        self.set("trends", trends)

    def get_trends(self) -> list[dict]:
        return self.get("trends") or []


# ── MemoryManager ──────────────────────────────────────────────────────────────

class MemoryManager:
    """Facade over the three memory layers.

    Conversation agent uses:
        store_message()     → writes to EpisodicMemory
        get_history()       → reads EpisodicMemory (full list)
        summarize_history() → reads EpisodicMemory (last 6, text format)
        clear()             → clears episodic + entity for a lead

    Entity layer used by:
        update_entity()     → called from research/outreach agents to persist facts
        get_entity()        → called when building prompts

    Semantic layer used by:
        update_trends()     → called after TrendAgent runs
        get_trends()        → called when building outreach context
    """

    def __init__(self):
        self.entity   = EntityMemory()
        self.episodic = EpisodicMemory()
        self.semantic = SemanticMemory()

    # ── episodic facade (backward-compatible) ──────────────────────────────────

    def store_message(self, lead_id: str, role: str, content: str) -> None:
        self.episodic.append(lead_id, role, content)

    def get_history(self, lead_id: str) -> list[dict]:
        return self.episodic.get(lead_id)

    def summarize_history(self, lead_id: str) -> str:
        history = self.episodic.recent(lead_id, 6)
        if not history:
            return "No prior conversation."
        return "\n".join(f"{m['role'].upper()}: {m['content']}" for m in history)

    def clear(self, lead_id: str) -> None:
        self.episodic.clear(lead_id)
        self.entity.clear(lead_id)

    # ── entity facade ──────────────────────────────────────────────────────────

    def update_entity(self, lead_id: str, facts: dict) -> None:
        self.entity.update(lead_id, facts)

    def get_entity(self, lead_id: str) -> dict:
        return self.entity.get(lead_id)

    # ── semantic facade ───────────────────────────────────────────────────────

    def update_trends(self, trends: list[dict]) -> None:
        self.semantic.update_trends(trends)

    def get_trends(self) -> list[dict]:
        return self.semantic.get_trends()
