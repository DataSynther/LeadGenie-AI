"""Memory governance event store.

Production: Redis HASH counters (survives ECS restarts).
  Key  : memory:stats          → all numeric counters (HINCRBY)
  Key  : memory:grounding:leads → SET of grounded lead_ids (SADD / SCARD)

Fallback (no REDIS_URL): in-process dict reset on restart — fine for local dev.
"""
from __future__ import annotations
import logging
from datetime import datetime, timezone
from collections import defaultdict

logger = logging.getLogger(__name__)

_STATS_KEY   = "memory:stats"
_LEADS_KEY   = "memory:grounding:leads"


# ── In-process fallback (local dev / Redis unavailable) ───────────────────────

_local: dict[str, int] = defaultdict(int)
_local_leads: set[str] = set()


def _incr(field: str, amount: int = 1) -> None:
    r = _redis()
    if r:
        try:
            r.hincrby(_STATS_KEY, field, amount)
            return
        except Exception as exc:
            logger.warning("Redis HINCRBY failed: %s", exc)
    _local[field] += amount


def _sadd_lead(lead_id: str) -> None:
    r = _redis()
    if r:
        try:
            r.sadd(_LEADS_KEY, lead_id)
            return
        except Exception as exc:
            logger.warning("Redis SADD failed: %s", exc)
    _local_leads.add(lead_id)


def _get_all() -> dict[str, int]:
    r = _redis()
    if r:
        try:
            raw = r.hgetall(_STATS_KEY)
            return {k: int(v) for k, v in raw.items()}
        except Exception as exc:
            logger.warning("Redis HGETALL failed: %s", exc)
    return dict(_local)


def _scard_leads() -> int:
    r = _redis()
    if r:
        try:
            return r.scard(_LEADS_KEY)
        except Exception as exc:
            logger.warning("Redis SCARD failed: %s", exc)
    return len(_local_leads)


def _redis():
    from storage.redis_client import get_redis
    return get_redis()


# ── Public store ──────────────────────────────────────────────────────────────

class MemoryEventStore:

    # ── Writers ───────────────────────────────────────────────────────────────

    def record_write(
        self,
        lead_id: str,
        memory_type: str,
        allowed: bool,
        reason: str,
        relevance_score: float = 0.0,
    ) -> None:
        if allowed:
            _incr("write:created")
        else:
            _incr("write:rejected")
            if reason in ("low_value_noise", "too_short", "below_relevance_threshold"):
                _incr("write:low_value")

    def record_retrieval(
        self,
        lead_id: str,
        retrieved: int,
        accepted: int,
        rejected: int,
    ) -> None:
        _incr("retrieval:retrieved", retrieved)
        _incr("retrieval:accepted",  accepted)
        _incr("retrieval:rejected",  rejected)

    def record_decay(
        self,
        lead_id: str,
        event_type: str,
        fact_type: str,
        effective_score: float,
    ) -> None:
        if event_type == "expired":
            _incr("decay:expired")
        elif event_type == "reaffirmed":
            _incr("decay:reaffirmed")
        elif event_type == "stale":
            _incr("decay:stale")

    def record_protection(
        self,
        lead_id: str,
        event_type: str,
        scope: str,
        allowed: bool,
    ) -> None:
        if not allowed:
            _incr("protection:blocked")
            if event_type == "read_attempt":
                _incr("protection:cross_tenant")
            elif event_type == "write_attempt":
                _incr("protection:ns_violations")

    def record_grounding_write(self, lead_id: str, facts_count: int) -> None:
        _incr("grounding:writes")
        _incr("grounding:total_facts", facts_count)
        _sadd_lead(lead_id)

    def record_grounding_read(self, lead_id: str, found: bool, facts_count: int) -> None:
        _incr("grounding:reads")
        if found:
            _incr("grounding:hits")
        else:
            _incr("grounding:misses")

    # ── Aggregation ───────────────────────────────────────────────────────────

    def get_stats(self) -> dict:
        c = _get_all()
        g_writes = c.get("grounding:writes", 0)
        total_facts = c.get("grounding:total_facts", 0)
        avg_facts = round(total_facts / max(g_writes, 1), 1)

        context_budget = self._compute_context_budget()

        return {
            "write_policy": {
                "memories_created":  c.get("write:created",   0),
                "memories_rejected": c.get("write:rejected",  0),
                "low_value_blocked": c.get("write:low_value", 0),
            },
            "retrieval_policy": {
                "retrieved":                c.get("retrieval:retrieved", 0),
                "accepted":                 c.get("retrieval:accepted",  0),
                "rejected_below_threshold": c.get("retrieval:rejected",  0),
            },
            "decay_policy": {
                "expired_facts":        c.get("decay:expired",    0),
                "reaffirmed_facts":     c.get("decay:reaffirmed", 0),
                "stale_facts_detected": c.get("decay:stale",      0),
            },
            "protection_policy": {
                "cross_tenant_reads":      c.get("protection:cross_tenant",    0),
                "blocked_access_attempts": c.get("protection:blocked",         0),
                "namespace_violations":    c.get("protection:ns_violations",   0),
            },
            "grounding_memory": {
                "writes":           g_writes,
                "reads":            c.get("grounding:reads",  0),
                "cache_hits":       c.get("grounding:hits",   0),
                "cache_misses":     c.get("grounding:misses", 0),
                "leads_grounded":   _scard_leads(),
                "avg_facts_stored": avg_facts,
            },
            "context_budget":      context_budget,
            "total_memory_events": sum(c.values()),
        }

    @staticmethod
    def _compute_context_budget() -> dict:
        try:
            import sys
            from pathlib import Path as _P
            sys.path.insert(0, str(_P(__file__).parent.parent))
            from observability import diagnostic_store
            traces = diagnostic_store.get_recent_traces(limit=200)
            tokens: dict[str, int] = {"research": 0, "outreach": 0, "intent": 0, "conversation": 0}
            for t in traces:
                agent = t.get("agent", "")
                if agent in tokens:
                    tokens[agent] += t.get("tokens_used", 0) or 0
            total = sum(tokens.values()) or 1
            current_task = round(tokens["outreach"] / total * 100, 1)
            research     = round(tokens["research"]  / total * 100, 1)
            memory       = round((tokens["intent"] + tokens["conversation"]) / total * 100, 1)
            used         = current_task + research + memory
            trends       = round(max(100 - used - 5, 0) * 0.6, 1)
            other        = round(max(100 - current_task - research - memory - trends, 0), 1)
            return {
                "current_task": current_task,
                "research":     research,
                "memory":       memory,
                "trends":       trends,
                "other":        other,
            }
        except Exception:
            return {"current_task": 40, "research": 20, "memory": 15, "trends": 15, "other": 10}
