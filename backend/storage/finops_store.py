"""AI FinOps metrics store.

Reads diagnostics/traces.jsonl to compute cost metrics without any new
instrumentation.  Joins with stats.db for outcome-based unit economics.

Model pricing (blended 70 % input / 30 % output):
  Sonnet  $3.00/1M in + $15.00/1M out → $6.60/1M blended
  Haiku   $0.80/1M in + $4.00/1M out  → $1.76/1M blended
"""
from __future__ import annotations

import json
import sqlite3
from collections import defaultdict
from pathlib import Path

STORAGE_DIR = Path(__file__).parent
DB_PATH     = STORAGE_DIR / "stats.db"
TRACES_FILE = STORAGE_DIR / "diagnostics" / "traces.jsonl"

# ── Pricing ───────────────────────────────────────────────────────────────────

_RATE_PER_1K: dict[str, float] = {
    "sonnet": 0.0066,   # blended 70/30 in/out at $3/$15 per 1M
    "haiku":  0.00176,  # blended 70/30 in/out at $0.80/$4 per 1M
}

_AGENT_MODEL: dict[str, str] = {
    "research":     "sonnet",
    "outreach":     "sonnet",
    "conversation": "sonnet",
    "intent":       "haiku",
    "governance":   "haiku",
    "gov":          "haiku",
    "schedule":     "haiku",
}

# Per-agent success criteria labels (shown in the UI)
_SUCCESS_CRITERIA: dict[str, str] = {
    "outreach":     "Email draft passed governance on first attempt",
    "research":     "Lead + company context retrieved without error",
    "conversation": "Contextual reply generated without fallback",
    "intent":       "Intent classified with ≥ 70% confidence",
    "gov":          "Governance layer rendered a clear allow/block decision",
    "governance":   "Governance layer rendered a clear allow/block decision",
    "schedule":     "Follow-up task created and queued",
}


def _cost(tokens: int, model: str) -> float:
    return tokens * _RATE_PER_1K.get(model, _RATE_PER_1K["sonnet"]) / 1000.0


def _load_traces() -> list[dict]:
    if not TRACES_FILE.exists():
        return []
    out: list[dict] = []
    for line in TRACES_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    return out


# ── Public API ────────────────────────────────────────────────────────────────

def get_finops_summary() -> dict:
    traces = _load_traces()

    # Accumulators
    agent_acc: dict[str, dict] = defaultdict(lambda: {
        "calls": 0, "tokens": 0, "cost": 0.0,
        "success_calls": 0, "success_cost": 0.0,
        "failure_calls": 0, "failure_cost": 0.0,
        "first_attempt_calls": 0, "first_attempt_cost": 0.0,
        "retry_calls": 0, "retry_success": 0, "retry_failure": 0,
        "retry_cost": 0.0,
        "high_conf_calls": 0,
    })
    model_acc: dict[str, dict] = defaultdict(lambda: {"calls": 0, "tokens": 0, "cost": 0.0})
    lead_acc:  dict[str, dict] = defaultdict(lambda: {"tokens": 0, "cost": 0.0, "agents": set()})
    pv_acc:    dict[tuple, dict] = defaultdict(lambda: {"calls": 0, "tokens": 0, "cost": 0.0})
    agent_day: dict[tuple, dict] = defaultdict(lambda: {
        "calls": 0, "tokens": 0, "cost": 0.0, "success_calls": 0,
        "retry_calls": 0, "retry_success": 0,
    })

    retry_traces:   list[dict] = []
    failure_traces: list[dict] = []

    # Group outreach traces by (lead_id, day) to identify jobs and their retry outcomes.
    # A "job" = one governance run that may span attempt 1, 2, 3...
    outreach_jobs: dict[str, dict] = defaultdict(lambda: {
        "attempts": [], "max_attempt": 0, "final_success": True, "cost": 0.0
    })

    for t in traces:
        agent   = t.get("agent") or "unknown"
        tokens  = t.get("tokens_used") or 0
        model   = _AGENT_MODEL.get(agent, "sonnet")
        cost    = _cost(tokens, model)
        success = t.get("success", True)
        meta    = t.get("metadata") or {}
        attempt = meta.get("attempt_number", 1)
        conf    = meta.get("confidence")
        day     = (t.get("ts") or "")[:10]
        lead_id = t.get("lead_id") or ""
        pv      = meta.get("prompt_version") or "unknown"

        # ── agent accumulator ─────────────────────────────────────────────────
        a = agent_acc[agent]
        a["calls"]  += 1
        a["tokens"] += tokens
        a["cost"]   += cost

        if success:
            a["success_calls"] += 1
            a["success_cost"]  += cost
        else:
            a["failure_calls"] += 1
            a["failure_cost"]  += cost
            failure_traces.append(t)

        if attempt == 1:
            a["first_attempt_calls"] += 1
            a["first_attempt_cost"]  += cost
        else:
            # A retry means the previous attempt failed → count as wasted
            a["retry_calls"]   += 1
            a["retry_cost"]    += cost
            if success:
                a["retry_success"] += 1
            else:
                a["retry_failure"] += 1
            retry_traces.append(t)

        # high-confidence for intent
        if agent == "intent" and conf is not None and conf >= 0.7:
            a["high_conf_calls"] += 1

        # ── track outreach jobs (lead_id + day as job key) ────────────────────
        if agent == "outreach" and lead_id and day:
            job_key = f"{lead_id}_{day}"
            job = outreach_jobs[job_key]
            job["attempts"].append(attempt)
            job["cost"] += cost
            if attempt >= job["max_attempt"]:
                job["max_attempt"] = attempt
                job["final_success"] = success

        # ── model accumulator ─────────────────────────────────────────────────
        model_acc[model]["calls"]  += 1
        model_acc[model]["tokens"] += tokens
        model_acc[model]["cost"]   += cost

        # ── lead accumulator ──────────────────────────────────────────────────
        if lead_id:
            lead_acc[lead_id]["tokens"]  += tokens
            lead_acc[lead_id]["cost"]    += cost
            lead_acc[lead_id]["agents"].add(agent)

        # ── prompt-version accumulator ────────────────────────────────────────
        pv_acc[(day, pv)]["calls"]  += 1
        pv_acc[(day, pv)]["tokens"] += tokens
        pv_acc[(day, pv)]["cost"]   += cost

        # ── agent × day series ────────────────────────────────────────────────
        ad = agent_day[(agent, day)]
        ad["calls"]         += 1
        ad["tokens"]        += tokens
        ad["cost"]          += cost
        if success:
            ad["success_calls"] += 1
        if attempt > 1:
            ad["retry_calls"] += 1
            if success:
                ad["retry_success"] += 1

    # ── Derive job-level outreach stats ───────────────────────────────────────
    total_jobs              = len(outreach_jobs)
    jobs_first_attempt_ok   = sum(1 for j in outreach_jobs.values() if j["max_attempt"] == 1)
    jobs_needed_retry       = sum(1 for j in outreach_jobs.values() if j["max_attempt"] > 1)
    jobs_retry_succeeded    = sum(1 for j in outreach_jobs.values() if j["max_attempt"] > 1 and j["final_success"])
    jobs_retry_failed       = jobs_needed_retry - jobs_retry_succeeded

    # ── cost_by_agent ─────────────────────────────────────────────────────────
    cost_by_agent = {
        agent: {
            "calls":             v["calls"],
            "tokens":            v["tokens"],
            "cost_usd":          round(v["cost"], 5),
            "avg_cost_per_call": round(v["cost"] / max(v["calls"], 1), 6),
            "model":             _AGENT_MODEL.get(agent, "sonnet"),
            "success_calls":     v["success_calls"],
            "failure_calls":     v["failure_calls"],
            "success_cost_usd":  round(v["success_cost"], 5),
            "failure_cost_usd":  round(v["failure_cost"], 5),
            "first_attempt_calls": v["first_attempt_calls"],
            "retry_calls":       v["retry_calls"],
            "retry_success":     v["retry_success"],
            "retry_failure":     v["retry_failure"],
            "high_conf_calls":   v["high_conf_calls"],
        }
        for agent, v in sorted(agent_acc.items(), key=lambda x: -x[1]["cost"])
    }

    # ── cost_to_success (per-agent with retry breakdown) ──────────────────────
    cost_to_success = []
    for agent, v in agent_acc.items():
        total_cost = v["cost"]

        if agent == "outreach":
            # A job is "successful first time" only if no retry was needed
            success_count = jobs_first_attempt_ok
            label         = _SUCCESS_CRITERIA["outreach"]
            # Wasted = all retry traces
            wasted        = v["retry_cost"]
        elif agent == "intent":
            success_count = v["high_conf_calls"] if v["high_conf_calls"] else v["success_calls"]
            label         = _SUCCESS_CRITERIA["intent"]
            wasted        = v["failure_cost"]
        else:
            success_count = v["success_calls"]
            label         = _SUCCESS_CRITERIA.get(agent, "Completed successfully")
            wasted        = v["failure_cost"]

        wasted_pct      = round(wasted / max(total_cost, 1e-9) * 100, 1)
        efficiency_score = round(100 - wasted_pct, 1)

        entry: dict = {
            "agent":            agent,
            "success_criteria": label,
            "calls":            v["calls"],
            "success_count":    success_count,
            "success_rate":     round(success_count / max(v["calls"], 1), 3),
            "cost_usd":         round(total_cost, 5),
            "cost_per_success": round(total_cost / max(success_count, 1), 6),
            "wasted_cost_usd":  round(wasted, 5),
            "wasted_pct":       wasted_pct,
            "efficiency_score": efficiency_score,
            # ── retry breakdown ───────────────────────────────────────────────
            "retry_calls":         v["retry_calls"],
            "retry_success":       v["retry_success"],
            "retry_failure":       v["retry_failure"],
            "retry_cost_usd":      round(v["retry_cost"], 5),
            "first_attempt_calls": v["first_attempt_calls"],
            "raw_success_calls":   v["success_calls"],
        }

        # job-level retry detail only for outreach
        if agent == "outreach":
            entry["jobs_total"]           = total_jobs
            entry["jobs_first_attempt_ok"]= jobs_first_attempt_ok
            entry["jobs_needed_retry"]    = jobs_needed_retry
            entry["jobs_retry_succeeded"] = jobs_retry_succeeded
            entry["jobs_retry_failed"]    = jobs_retry_failed

        cost_to_success.append(entry)
    cost_to_success.sort(key=lambda x: -x["cost_usd"])

    # ── model_routing ─────────────────────────────────────────────────────────
    total_calls = max(sum(v["calls"] for v in model_acc.values()), 1)
    total_cost  = sum(v["cost"] for v in model_acc.values()) or 1e-9
    model_routing = {
        m: {
            "calls":     v["calls"],
            "tokens":    v["tokens"],
            "cost_usd":  round(v["cost"], 5),
            "pct_calls": round(v["calls"] / total_calls * 100, 1),
            "pct_cost":  round(v["cost"]  / total_cost  * 100, 1),
        }
        for m, v in model_acc.items()
    }

    # ── cost_by_lead ──────────────────────────────────────────────────────────
    cost_by_lead = [
        {
            "lead_id":  lid,
            "tokens":   v["tokens"],
            "cost_usd": round(v["cost"], 5),
            "agents":   sorted(v["agents"]),
        }
        for lid, v in sorted(lead_acc.items(), key=lambda x: -x[1]["cost"])
    ][:20]

    # ── retry_info ────────────────────────────────────────────────────────────
    def _tc(t: dict) -> float:
        return _cost(t.get("tokens_used") or 0, _AGENT_MODEL.get(t.get("agent") or "", "sonnet"))

    retry_info = {
        "retry_calls":       len(retry_traces),
        "failed_calls":      len(failure_traces),
        "retry_cost_usd":    round(sum(_tc(t) for t in retry_traces),   5),
        "failure_cost_usd":  round(sum(_tc(t) for t in failure_traces), 5),
        "failure_rate_pct":  round(len(failure_traces) / max(len(traces), 1) * 100, 1),
    }

    # ── governance_info ───────────────────────────────────────────────────────
    halluc_traces = [
        t for t in traces
        if "hallucination" in (t.get("diagnostic_categories") or [])
        or (t.get("agent") or "").startswith("gov")
    ]
    governance_info = {
        "hallucination_check_calls": len(halluc_traces),
        "governance_cost_usd": round(sum(_tc(t) for t in halluc_traces), 5),
    }

    # ── prompt_savings (daily per prompt-version) ─────────────────────────────
    prompt_savings = [
        {
            "date":                k[0],
            "prompt_version":      k[1],
            "calls":               v["calls"],
            "tokens":              v["tokens"],
            "cost_usd":            round(v["cost"], 5),
            "avg_tokens_per_call": round(v["tokens"] / max(v["calls"], 1)),
        }
        for k, v in sorted(pv_acc.items())
    ]

    # ── agent_daily_series (for multi-line chart) ─────────────────────────────
    agent_daily_series = [
        {
            "agent":             k[0],
            "date":              k[1],
            "calls":             v["calls"],
            "tokens":            v["tokens"],
            "cost_usd":          round(v["cost"], 5),
            "avg_tokens":        round(v["tokens"] / max(v["calls"], 1)),
            "success_calls":     v["success_calls"],
            "retry_success":     v["retry_success"],
        }
        for k, v in sorted(agent_day.items())
        if k[1]  # skip blank dates
    ]

    # ── totals ────────────────────────────────────────────────────────────────
    total_tokens   = sum(t.get("tokens_used") or 0 for t in traces)
    total_cost_usd = sum(_tc(t) for t in traces)
    success_cost   = sum(
        _cost(t.get("tokens_used") or 0, _AGENT_MODEL.get(t.get("agent") or "", "sonnet"))
        for t in traces if t.get("success", True)
    )
    wasted_cost = total_cost_usd - success_cost + retry_info["retry_cost_usd"]

    cost_per_outcome  = _outcome_costs(lead_acc)
    validator_success = cost_per_outcome.pop("validator_success", None)

    return {
        "total_traces":        len(traces),
        "total_tokens":        total_tokens,
        "total_cost_usd":      round(total_cost_usd, 4),
        "success_cost_usd":    round(success_cost, 4),
        "wasted_cost_usd":     round(wasted_cost, 4),
        "cost_by_agent":       cost_by_agent,
        "cost_to_success":     cost_to_success,
        "model_routing":       model_routing,
        "cost_by_lead":        cost_by_lead,
        "retry_info":          retry_info,
        "governance_info":     governance_info,
        "prompt_savings":      prompt_savings,
        "agent_daily_series":  agent_daily_series,
        "cost_per_outcome":    cost_per_outcome,
        "validator_success":   validator_success,
    }


def _outcome_costs(lead_acc: dict) -> dict:
    if not DB_PATH.exists():
        return {}
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row

        def _ids(sql: str) -> set:
            return {r["lead_id"] for r in conn.execute(sql).fetchall()}

        approved_leads       = _ids("SELECT DISTINCT lead_id FROM outreach_events WHERE status='approved'")
        blocked_leads        = _ids("SELECT DISTINCT lead_id FROM outreach_events WHERE hallucination_passed=0 OR tone_passed=0")
        meeting_leads        = _ids("SELECT DISTINCT lead_id FROM conversation_events WHERE intent='meeting_request'")
        all_outreach_leads   = _ids("SELECT DISTINCT lead_id FROM outreach_events")

        # Validator success: did the outreach that passed tone/halluc checks actually get a reply?
        tone_passed_leads    = _ids("SELECT DISTINCT lead_id FROM outreach_events WHERE tone_passed=1")
        halluc_passed_leads  = _ids("SELECT DISTINCT lead_id FROM outreach_events WHERE hallucination_passed=1")
        halluc_blocked_leads = _ids("SELECT DISTINCT lead_id FROM outreach_events WHERE hallucination_passed=0")
        both_passed_leads    = tone_passed_leads & halluc_passed_leads

        # replied_leads = any lead we received a conversation event for (i.e. they wrote back)
        replied_leads = _ids("SELECT DISTINCT lead_id FROM conversation_events")

        conn.close()

        tone_passed_replied   = tone_passed_leads   & replied_leads
        halluc_passed_replied = halluc_passed_leads & replied_leads
        both_passed_replied   = both_passed_leads   & replied_leads
        false_positive_leads  = halluc_blocked_leads & replied_leads  # blocked but replied anyway

        def avg_lead_cost(s: set) -> float:
            costs = [lead_acc[lid]["cost"] for lid in s if lid in lead_acc]
            return round(sum(costs) / max(len(costs), 1), 5) if costs else 0.0

        validator_success = {
            "tone_passed_total":     len(tone_passed_leads),
            "tone_passed_replied":   len(tone_passed_replied),
            "tone_success_rate":     round(len(tone_passed_replied)   / max(len(tone_passed_leads),   1), 3),
            "halluc_passed_total":   len(halluc_passed_leads),
            "halluc_passed_replied": len(halluc_passed_replied),
            "halluc_success_rate":   round(len(halluc_passed_replied) / max(len(halluc_passed_leads), 1), 3),
            "both_passed_total":     len(both_passed_leads),
            "both_passed_replied":   len(both_passed_replied),
            "both_success_rate":     round(len(both_passed_replied)   / max(len(both_passed_leads),   1), 3),
            "false_positives":       len(false_positive_leads),
            "false_positive_rate":   round(len(false_positive_leads)  / max(len(halluc_blocked_leads), 1), 3),
            "replied_total":         len(replied_leads),
        }

        return {
            "per_outreach_generated": avg_lead_cost(all_outreach_leads),
            "per_approved_outreach":  avg_lead_cost(approved_leads),
            "per_blocked_outreach":   avg_lead_cost(blocked_leads),
            "per_meeting_booked":     round(sum(lead_acc[l]["cost"] for l in meeting_leads if l in lead_acc) / max(len(meeting_leads), 1), 5),
            "total_approved_leads":   len(approved_leads),
            "total_blocked_leads":    len(blocked_leads),
            "total_meeting_leads":    len(meeting_leads),
            "total_outreach_leads":   len(all_outreach_leads),
            "validator_success":      validator_success,
        }
    except Exception:
        return {}
