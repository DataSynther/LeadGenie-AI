"""Central store for all observability events — traces, validations, diagnostics."""
import json
from datetime import datetime, timezone
from pathlib import Path
from collections import defaultdict
from typing import Optional

STORE_DIR = Path(__file__).parent.parent / "storage" / "diagnostics"
TRACES_FILE       = STORE_DIR / "traces.jsonl"
VALIDATIONS_FILE  = STORE_DIR / "validations.jsonl"
GOVERNANCE_RUNS_FILE = STORE_DIR / "governance_runs.jsonl"
STORE_DIR.mkdir(parents=True, exist_ok=True)


# ── Failure categories (maps to the 5 upstream hallucination causes) ──────────

CATEGORY_RETRIEVAL     = "retrieval_failure"       # semantically right, factually wrong
CATEGORY_CONTEXT       = "insufficient_context"    # missing / thin context
CATEGORY_PROMPT        = "ambiguous_prompt"        # vague instructions
CATEGORY_VALIDATION    = "validation_gap"          # no check downstream
CATEGORY_TASK_MISMATCH = "task_model_mismatch"     # model not suited / low confidence


def _append(path: Path, record: dict) -> None:
    with open(path, "a") as f:
        f.write(json.dumps(record) + "\n")


def _read_all(path: Path) -> list:
    if not path.exists():
        return []
    out = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    out.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
    return out


# ── Trace writer ──────────────────────────────────────────────────────────────

def write_trace(
    agent: str,
    lead_id: Optional[str],
    prompt_preview: str,        # first 300 chars of prompt
    response_preview: str,      # first 300 chars of response
    latency_ms: float,
    tokens_used: int,
    success: bool,
    diagnostic_categories: list[str],   # which of the 5 categories fired
    metadata: Optional[dict] = None,
) -> dict:
    record = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "agent": agent,
        "lead_id": lead_id,
        "prompt_preview": prompt_preview[:300],
        "response_preview": response_preview[:300],
        "latency_ms": round(latency_ms, 1),
        "tokens_used": tokens_used,
        "success": success,
        "diagnostic_categories": diagnostic_categories,
        "metadata": metadata or {},
    }
    _append(TRACES_FILE, record)
    return record


# ── Validation writer ─────────────────────────────────────────────────────────

def write_validation(
    agent: str,
    lead_id: Optional[str],
    shape_ok: bool,
    context_ok: bool,
    policy_ok: bool,
    consequence: str,           # "allow" | "block" | "defer"
    issues: list[str],
    output_preview: str,
) -> dict:
    record = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "agent": agent,
        "lead_id": lead_id,
        "shape_ok": shape_ok,
        "context_ok": context_ok,
        "policy_ok": policy_ok,
        "consequence": consequence,
        "issues": issues,
        "output_preview": output_preview[:300],
    }
    _append(VALIDATIONS_FILE, record)
    return record


# ── Governance run writer ─────────────────────────────────────────────────────

def write_governance_run(
    lead_id: Optional[str],
    prompt_version: str,
    agent: str,
    attempt_history: list,
    final_passed: bool,
    final_risk_score: Optional[float] = None,
    lead_name: Optional[str] = None,
    company_name: Optional[str] = None,
) -> dict:
    """Persist full per-attempt governance data for the PromptVersionsPage."""
    record = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "lead_id": lead_id,
        "lead_name": lead_name,
        "company_name": company_name,
        "prompt_version": prompt_version,
        "agent": agent,
        "total_attempts": len(attempt_history),
        "final_passed": final_passed,
        "final_risk_score": final_risk_score,
        "attempts": attempt_history,
    }
    _append(GOVERNANCE_RUNS_FILE, record)
    return record


# ── Query helpers ─────────────────────────────────────────────────────────────

def get_governance_runs(limit: int = 100) -> list:
    """Return recent governance runs with full per-attempt data."""
    return _read_all(GOVERNANCE_RUNS_FILE)[-limit:]


def get_recent_traces(limit: int = 50) -> list:
    return _read_all(TRACES_FILE)[-limit:]


def get_recent_validations(limit: int = 50) -> list:
    return _read_all(VALIDATIONS_FILE)[-limit:]


def get_agent_metrics() -> dict:
    """Per-agent aggregated stats."""
    traces = _read_all(TRACES_FILE)
    validations = _read_all(VALIDATIONS_FILE)

    agents = set(t["agent"] for t in traces) | set(v["agent"] for v in validations)
    metrics = {}

    for agent in agents:
        agent_traces = [t for t in traces if t["agent"] == agent]
        agent_vals   = [v for v in validations if v["agent"] == agent]

        latencies = [t["latency_ms"] for t in agent_traces if t.get("latency_ms")]
        tokens    = [t["tokens_used"] for t in agent_traces if t.get("tokens_used")]
        conf_list = [t["metadata"].get("confidence") for t in agent_traces if t.get("metadata", {}).get("confidence")]

        allow_count = sum(1 for v in agent_vals if v["consequence"] == "allow")
        block_count = sum(1 for v in agent_vals if v["consequence"] == "block")
        defer_count = sum(1 for v in agent_vals if v["consequence"] == "defer")
        total_vals  = len(agent_vals) or 1

        metrics[agent] = {
            "total_calls": len(agent_traces),
            "success_rate": round(sum(1 for t in agent_traces if t["success"]) / max(len(agent_traces), 1), 3),
            "avg_latency_ms": round(sum(latencies) / len(latencies), 1) if latencies else 0,
            "avg_tokens": round(sum(tokens) / len(tokens)) if tokens else 0,
            "avg_confidence": round(sum(conf_list) / len(conf_list), 3) if conf_list else None,
            "validation": {
                "total": len(agent_vals),
                "allow": allow_count,
                "block": block_count,
                "defer": defer_count,
                "pass_rate": round(allow_count / total_vals, 3),
            },
        }
    return metrics


def get_diagnostics_summary() -> dict:
    """Count events per diagnostic category across all traces."""
    traces = _read_all(TRACES_FILE)
    counts: dict = defaultdict(int)
    recent: dict = defaultdict(list)

    for t in traces:
        for cat in t.get("diagnostic_categories", []):
            counts[cat] += 1
            recent[cat].append({
                "ts": t["ts"],
                "agent": t["agent"],
                "lead_id": t.get("lead_id"),
                "detail": t["metadata"].get("diagnostic_detail", ""),
            })

    # keep last 5 per category
    for cat in recent:
        recent[cat] = recent[cat][-5:]

    categories = [
        CATEGORY_RETRIEVAL,
        CATEGORY_CONTEXT,
        CATEGORY_PROMPT,
        CATEGORY_VALIDATION,
        CATEGORY_TASK_MISMATCH,
    ]

    return {
        "total_traces": len(traces),
        "by_category": {
            cat: {
                "count": counts.get(cat, 0),
                "label": _category_label(cat),
                "description": _category_description(cat),
                "recent_events": recent.get(cat, []),
            }
            for cat in categories
        },
    }


def _category_label(cat: str) -> str:
    return {
        CATEGORY_RETRIEVAL:     "Retrieval Failure",
        CATEGORY_CONTEXT:       "Insufficient Context",
        CATEGORY_PROMPT:        "Ambiguous Prompt",
        CATEGORY_VALIDATION:    "Validation Gap",
        CATEGORY_TASK_MISMATCH: "Task-Model Mismatch",
    }.get(cat, cat)


def get_citations_log(limit: int = 50) -> list:
    """Return recent traces that have citation metadata attached."""
    traces = _read_all(TRACES_FILE)
    cited = [
        {
            "ts": t["ts"],
            "agent": t["agent"],
            "lead_id": t.get("lead_id"),
            "citations": t["metadata"].get("citations"),
            "retrieval_score": t["metadata"].get("retrieval_score"),
            "response_preview": t.get("response_preview", "")[:200],
        }
        for t in traces
        if t.get("metadata", {}).get("citations")
    ]
    return cited[-limit:]


def get_retrieval_stats() -> dict:
    """Return retrieval score distribution across all traced calls."""
    traces = _read_all(TRACES_FILE)
    scores = [
        t["metadata"]["retrieval_score"]
        for t in traces
        if t.get("metadata", {}).get("retrieval_score") is not None
    ]
    if not scores:
        return {"count": 0, "avg": None, "below_threshold": 0, "histogram": []}

    threshold = 0.55
    buckets = [0, 0, 0, 0, 0]  # 0–0.2, 0.2–0.4, 0.4–0.6, 0.6–0.8, 0.8–1.0
    for s in scores:
        idx = min(int(s / 0.2), 4)
        buckets[idx] += 1

    return {
        "count": len(scores),
        "avg": round(sum(scores) / len(scores), 3),
        "below_threshold": sum(1 for s in scores if s < threshold),
        "histogram": [
            {"range": f"{i*20}–{(i+1)*20}%", "count": buckets[i]}
            for i in range(5)
        ],
    }


def get_self_eval_stats() -> dict:
    """Return self-evaluation confidence distribution across agents."""
    traces = _read_all(TRACES_FILE)
    by_agent: dict = defaultdict(list)
    for t in traces:
        se = t.get("metadata", {}).get("self_eval")
        if se and se.get("confidence") is not None:
            by_agent[t["agent"]].append(se["confidence"])

    result = {}
    for agent, confs in by_agent.items():
        result[agent] = {
            "count": len(confs),
            "avg_confidence": round(sum(confs) / len(confs), 3),
            "below_threshold": sum(1 for c in confs if c < 0.65),
        }
    return result


def get_prompt_version_stats() -> dict:
    """Aggregate per prompt_version: runs, pass rates, avg attempts, recent runs.

    Prefers governance_runs.jsonl (rich per-attempt data) for recent_runs;
    falls back to traces.jsonl when no governance runs are recorded yet.
    """
    traces = _read_all(TRACES_FILE)
    gov_runs = _read_all(GOVERNANCE_RUNS_FILE)

    # Index traces by prompt_version
    traces_by_version: dict = defaultdict(list)
    for t in traces:
        pv = (t.get("metadata") or {}).get("prompt_version")
        if pv:
            traces_by_version[pv].append(t)

    # Index governance runs by prompt_version
    gov_by_version: dict = defaultdict(list)
    for r in gov_runs:
        pv = r.get("prompt_version")
        if pv:
            gov_by_version[pv].append(r)

    all_versions = set(traces_by_version.keys()) | set(gov_by_version.keys())

    result = {}
    for version in all_versions:
        version_gov = gov_by_version[version]
        version_traces = traces_by_version[version]

        # Prefer governance runs for aggregation if available (more accurate per-run view)
        if version_gov:
            total = len(version_gov)
            attempt_nums = [r.get("total_attempts", 1) for r in version_gov]
            first_pass = sum(1 for r in version_gov if r.get("total_attempts", 1) == 1 and r.get("final_passed", True))
            agent_name = version_gov[0].get("agent", "outreach")
        else:
            total = len(version_traces)
            attempt_nums = [(t.get("metadata") or {}).get("attempt_number", 1) for t in version_traces]
            first_pass = sum(1 for t in version_traces
                             if (t.get("metadata") or {}).get("attempt_number", 1) == 1
                             and not t.get("diagnostic_categories"))
            agent_name = version_traces[0]["agent"] if version_traces else "outreach"

        retrieval_scores = [(t.get("metadata") or {}).get("retrieval_score")
                            for t in version_traces
                            if (t.get("metadata") or {}).get("retrieval_score") is not None]
        self_confs = [((t.get("metadata") or {}).get("self_eval") or {}).get("confidence")
                      for t in version_traces
                      if ((t.get("metadata") or {}).get("self_eval") or {}).get("confidence") is not None]

        attempt_dist = {1: 0, 2: 0, 3: 0}
        for n in attempt_nums:
            attempt_dist[min(n, 3)] += 1

        # Build recent_runs — governance runs provide the richest data
        if version_gov:
            recent_gov = sorted(version_gov, key=lambda r: r["ts"], reverse=True)[:5]
            recent_runs = []
            for r in recent_gov:
                attempts = r.get("attempts") or []
                first_attempt = attempts[0] if attempts else {}
                last_attempt = attempts[-1] if attempts else {}
                recent_runs.append({
                    "ts": r["ts"],
                    "agent": r.get("agent", "outreach"),
                    "lead_id": r.get("lead_id"),
                    "prompt_preview": first_attempt.get("prompt_preview", "")[:400],
                    "response_preview": (last_attempt.get("email") or {}).get("body", "")[:400],
                    "attempt_number": r.get("total_attempts", 1),
                    "attempt_history": attempts,
                    "retrieval_score": None,
                    "self_eval_confidence": None,
                    "diagnostic_categories": [] if r.get("final_passed") else ["governance_retry"],
                    "latency_ms": None,
                    "tokens_used": None,
                })
        else:
            recent = sorted(version_traces, key=lambda t: t["ts"], reverse=True)[:5]
            recent_runs = []
            for t in recent:
                meta = t.get("metadata") or {}
                recent_runs.append({
                    "ts": t["ts"],
                    "agent": t["agent"],
                    "lead_id": t.get("lead_id"),
                    "prompt_preview": t.get("prompt_preview", "")[:400],
                    "response_preview": t.get("response_preview", "")[:400],
                    "attempt_number": meta.get("attempt_number", 1),
                    "attempt_history": meta.get("attempt_history") or [],
                    "retrieval_score": meta.get("retrieval_score"),
                    "self_eval_confidence": (meta.get("self_eval") or {}).get("confidence"),
                    "diagnostic_categories": t.get("diagnostic_categories", []),
                    "latency_ms": t.get("latency_ms"),
                    "tokens_used": t.get("tokens_used"),
                })

        result[version] = {
            "total_runs": total,
            "first_attempt_pass_rate": round(first_pass / total, 3) if total else 0,
            "avg_attempts": round(sum(attempt_nums) / total, 2) if total else 1.0,
            "attempt_distribution": attempt_dist,
            "avg_retrieval_score": round(sum(retrieval_scores) / len(retrieval_scores), 3) if retrieval_scores else None,
            "avg_self_eval_confidence": round(sum(self_confs) / len(self_confs), 3) if self_confs else None,
            "agent": agent_name,
            "recent_runs": recent_runs,
        }

    return result


def _category_description(cat: str) -> str:
    return {
        CATEGORY_RETRIEVAL:     "Answer is semantically plausible but factually incorrect — retrieved context was close but wrong.",
        CATEGORY_CONTEXT:       "Context passed to the model was missing critical fields, too thin, or incomplete.",
        CATEGORY_PROMPT:        "Prompt contained vague behavioral instructions. Model chose an interpretation that was never validated.",
        CATEGORY_VALIDATION:    "Model output flowed downstream with no shape, context, or policy check applied.",
        CATEGORY_TASK_MISMATCH: "Model confidence was low or output schema mismatched — model may not be suited to this task.",
    }.get(cat, cat)
