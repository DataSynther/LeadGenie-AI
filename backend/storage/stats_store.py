"""SQLite-backed stats store for the Mission Control dashboard.

Three tables:
  outreach_events    — one row per generated email (from outreach queue)
  conversation_events — one row per classified reply (from intent analytics)
  agent_events        — one row per agent trace (from diagnostics)

On first use, syncs data from existing JSONL files so historical data
is not lost.  All new events are written here in addition to their
existing JSONL sinks.
"""
from __future__ import annotations

import json
import sqlite3
import threading
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

STORAGE_DIR = Path(__file__).parent
DB_PATH = STORAGE_DIR / "stats.db"

_QUEUE_FILE      = STORAGE_DIR / "outreach_queue" / "queue.jsonl"
_INTENT_FILE     = STORAGE_DIR / "intent_analytics" / "events.jsonl"
_TRACES_FILE     = STORAGE_DIR / "diagnostics" / "traces.jsonl"

_lock = threading.Lock()


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def _migrate(conn: sqlite3.Connection) -> None:
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS outreach_events (
        event_id            TEXT PRIMARY KEY,
        lead_id             TEXT,
        lead_name           TEXT,
        company_name        TEXT,
        risk_score          REAL,
        risk_level          TEXT,
        status              TEXT DEFAULT 'pending',
        tone_passed         INTEGER,
        hallucination_passed INTEGER,
        tone_issues         TEXT,
        hallucination_violations TEXT,
        total_attempts      INTEGER DEFAULT 1,
        timestamp           TEXT
    );

    CREATE TABLE IF NOT EXISTS conversation_events (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_id   TEXT,
        intent    TEXT,
        confidence REAL,
        timestamp TEXT
    );

    CREATE TABLE IF NOT EXISTS agent_events (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        agent       TEXT,
        message     TEXT,
        lead_id     TEXT,
        latency_ms  REAL,
        success     INTEGER DEFAULT 1,
        timestamp   TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_oe_ts    ON outreach_events(timestamp);
    CREATE INDEX IF NOT EXISTS idx_ce_ts    ON conversation_events(timestamp);
    CREATE INDEX IF NOT EXISTS idx_ae_ts    ON agent_events(timestamp);
    CREATE INDEX IF NOT EXISTS idx_oe_lead  ON outreach_events(lead_id);
    """)
    conn.commit()


# ── Sync from existing JSONL files ───────────────────────────────────────────

def _sync_queue(conn: sqlite3.Connection) -> int:
    if not _QUEUE_FILE.exists():
        return 0
    inserted = 0
    for line in _QUEUE_FILE.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            r = json.loads(line)
        except json.JSONDecodeError:
            continue
        event_id = r.get("event_id", "")
        if not event_id:
            continue
        existing = conn.execute(
            "SELECT 1 FROM outreach_events WHERE event_id=?", (event_id,)
        ).fetchone()
        if existing:
            continue
        checkpoints = r.get("checkpoints") or {}
        tone_passed = int(checkpoints.get("tone", {}).get("passed", True))
        halluc_passed = int(checkpoints.get("hallucination", {}).get("ok", True))
        tone_issues = json.dumps(checkpoints.get("tone", {}).get("issues", []))
        halluc_violations = json.dumps(checkpoints.get("hallucination", {}).get("violations", []))
        conn.execute(
            """INSERT OR IGNORE INTO outreach_events
               (event_id, lead_id, lead_name, company_name, risk_score, risk_level,
                status, tone_passed, hallucination_passed, tone_issues,
                hallucination_violations, total_attempts, timestamp)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                event_id,
                r.get("lead_id", ""),
                r.get("lead_name", ""),
                r.get("company_name", ""),
                r.get("risk_score"),
                r.get("risk_level", "low"),
                r.get("status", "pending"),
                tone_passed,
                halluc_passed,
                tone_issues,
                halluc_violations,
                r.get("total_attempts", 1),
                r.get("timestamp", ""),
            ),
        )
        inserted += 1
    conn.commit()
    return inserted


def _sync_intent(conn: sqlite3.Connection) -> int:
    if not _INTENT_FILE.exists():
        return 0
    inserted = 0
    for line in _INTENT_FILE.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            r = json.loads(line)
        except json.JSONDecodeError:
            continue
        conn.execute(
            "INSERT INTO conversation_events (lead_id, intent, confidence, timestamp) VALUES (?,?,?,?)",
            (r.get("lead_id", ""), r.get("intent", ""), r.get("confidence"), r.get("timestamp", "")),
        )
        inserted += 1
    conn.commit()
    return inserted


def _sync_traces(conn: sqlite3.Connection) -> int:
    if not _TRACES_FILE.exists():
        return 0
    inserted = 0
    for line in _TRACES_FILE.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            r = json.loads(line)
        except json.JSONDecodeError:
            continue
        agent = r.get("agent", "")
        # Build a human-readable message from trace fields
        lead_id = r.get("lead_id") or ""
        preview = r.get("response_preview") or ""
        msg = _trace_to_message(agent, lead_id, r)
        conn.execute(
            "INSERT INTO agent_events (agent, message, lead_id, latency_ms, success, timestamp) VALUES (?,?,?,?,?,?)",
            (agent, msg, lead_id, r.get("latency_ms"), int(r.get("success", True)), r.get("ts", "")),
        )
        inserted += 1
    conn.commit()
    return inserted


def _trace_to_message(agent: str, lead_id: str, trace: dict) -> str:
    preview = (trace.get("response_preview") or "").strip()[:80]
    suffix = f" · {lead_id}" if lead_id else ""
    if agent == "outreach":
        return f"Generated outreach email{suffix}"
    if agent == "research":
        return f"Researched company context{suffix}"
    if agent == "intent":
        return f"Classified reply intent{suffix}: {preview}" if preview else f"Classified reply intent{suffix}"
    if agent == "conversation":
        return f"Replied to lead{suffix}"
    return f"{agent.capitalize()} agent ran{suffix}"


# ── Public init ───────────────────────────────────────────────────────────────

def init() -> None:
    """Create tables and sync existing JSONL data. Call once at startup."""
    with _lock:
        conn = _connect()
        _migrate(conn)
        _sync_queue(conn)
        _sync_intent(conn)
        _sync_traces(conn)
        conn.close()


# ── Write methods ─────────────────────────────────────────────────────────────

def record_outreach(
    event_id: str,
    lead_id: str,
    lead_name: str,
    company_name: str,
    risk_score: float,
    risk_level: str,
    status: str,
    tone_passed: bool,
    hallucination_passed: bool,
    tone_issues: list,
    hallucination_violations: list,
    total_attempts: int,
    timestamp: Optional[str] = None,
) -> None:
    ts = timestamp or datetime.now(timezone.utc).isoformat()
    with _lock:
        conn = _connect()
        conn.execute(
            """INSERT OR REPLACE INTO outreach_events
               (event_id, lead_id, lead_name, company_name, risk_score, risk_level,
                status, tone_passed, hallucination_passed, tone_issues,
                hallucination_violations, total_attempts, timestamp)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                event_id, lead_id, lead_name, company_name,
                risk_score, risk_level, status,
                int(tone_passed), int(hallucination_passed),
                json.dumps(tone_issues), json.dumps(hallucination_violations),
                total_attempts, ts,
            ),
        )
        conn.commit()
        conn.close()


def record_conversation(
    lead_id: str,
    intent: str,
    confidence: Optional[float] = None,
    timestamp: Optional[str] = None,
) -> None:
    ts = timestamp or datetime.now(timezone.utc).isoformat()
    with _lock:
        conn = _connect()
        conn.execute(
            "INSERT INTO conversation_events (lead_id, intent, confidence, timestamp) VALUES (?,?,?,?)",
            (lead_id, intent, confidence, ts),
        )
        conn.commit()
        conn.close()


def record_agent_event(
    agent: str,
    message: str,
    lead_id: str = "",
    latency_ms: Optional[float] = None,
    success: bool = True,
    timestamp: Optional[str] = None,
) -> None:
    ts = timestamp or datetime.now(timezone.utc).isoformat()
    with _lock:
        conn = _connect()
        conn.execute(
            "INSERT INTO agent_events (agent, message, lead_id, latency_ms, success, timestamp) VALUES (?,?,?,?,?,?)",
            (agent, message, lead_id, latency_ms, int(success), ts),
        )
        conn.commit()
        conn.close()


def update_outreach_status(event_id: str, status: str) -> None:
    with _lock:
        conn = _connect()
        conn.execute(
            "UPDATE outreach_events SET status=? WHERE event_id=?",
            (status, event_id),
        )
        conn.commit()
        conn.close()


# ── Aggregation queries ───────────────────────────────────────────────────────

def _iso_days_ago(n: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=n)).isoformat()


def get_dashboard_stats() -> dict:
    with _lock:
        conn = _connect()

        # ── Window helpers ────────────────────────────────────────────────────
        now_7   = _iso_days_ago(7)
        now_14  = _iso_days_ago(14)
        now_30  = _iso_days_ago(30)

        def scalar(sql: str, params: tuple = ()) -> int | float:
            row = conn.execute(sql, params).fetchone()
            return row[0] if row and row[0] is not None else 0

        # ── Prospects discovered ─────────────────────────────────────────────
        pd_cur  = scalar("SELECT COUNT(DISTINCT lead_id) FROM outreach_events WHERE timestamp>=?", (now_7,))
        pd_prev = scalar("SELECT COUNT(DISTINCT lead_id) FROM outreach_events WHERE timestamp>=? AND timestamp<?", (now_14, now_7))
        pd_delta = round(((pd_cur - pd_prev) / max(pd_prev, 1)) * 100, 1)

        # ── Messages sent ────────────────────────────────────────────────────
        ms_cur  = scalar("SELECT COUNT(*) FROM outreach_events WHERE timestamp>=?", (now_7,))
        ms_prev = scalar("SELECT COUNT(*) FROM outreach_events WHERE timestamp>=? AND timestamp<?", (now_14, now_7))
        ms_delta = round(((ms_cur - ms_prev) / max(ms_prev, 1)) * 100, 1)

        # ── Reply rate ───────────────────────────────────────────────────────
        replies_cur = scalar("SELECT COUNT(DISTINCT lead_id) FROM conversation_events WHERE timestamp>=?", (now_7,))
        rr_value    = round((replies_cur / max(ms_cur, 1)) * 100, 1)
        replies_prev = scalar("SELECT COUNT(DISTINCT lead_id) FROM conversation_events WHERE timestamp>=? AND timestamp<?", (now_14, now_7))
        rr_prev      = (replies_prev / max(ms_prev, 1)) * 100
        rr_delta     = round(rr_value - rr_prev, 1)

        # ── Meetings booked ──────────────────────────────────────────────────
        mtg_cur  = scalar("SELECT COUNT(DISTINCT lead_id) FROM conversation_events WHERE intent='meeting_request' AND timestamp>=?", (now_7,))
        mtg_prev = scalar("SELECT COUNT(DISTINCT lead_id) FROM conversation_events WHERE intent='meeting_request' AND timestamp>=? AND timestamp<?", (now_14, now_7))
        mtg_delta = mtg_cur - mtg_prev

        # ── Funnel (last 30 days) — all counts are DISTINCT lead_ids ────────
        total_leads    = scalar("SELECT COUNT(DISTINCT lead_id) FROM outreach_events WHERE timestamp>=?", (now_30,))
        total_sent     = scalar("SELECT COUNT(DISTINCT lead_id) FROM outreach_events WHERE status!='rejected' AND timestamp>=?", (now_30,))
        total_engaged  = scalar("SELECT COUNT(DISTINCT lead_id) FROM conversation_events WHERE timestamp>=?", (now_30,))
        total_mtg_30   = scalar("SELECT COUNT(DISTINCT lead_id) FROM conversation_events WHERE intent='meeting_request' AND timestamp>=?", (now_30,))
        total_approved = scalar("SELECT COUNT(DISTINCT lead_id) FROM outreach_events WHERE status='approved' AND timestamp>=?", (now_30,))

        funnel_base = max(total_leads, 1)
        funnel = [
            {"label": "Discovered",      "count": total_leads,   "pct": 100},
            {"label": "Sent",            "count": total_sent,    "pct": round((total_sent    / funnel_base) * 100)},
            {"label": "Engaged",         "count": total_engaged, "pct": round((total_engaged / funnel_base) * 100)},
            {"label": "Meeting Booked",  "count": total_mtg_30,  "pct": round((total_mtg_30  / funnel_base) * 100)},
        ]

        # ── Risk distribution (last 30 days) ─────────────────────────────────
        risk_rows = conn.execute(
            "SELECT risk_level, COUNT(*) as cnt FROM outreach_events WHERE timestamp>=? GROUP BY risk_level",
            (now_30,),
        ).fetchall()
        risk_dist = {"low": 0, "medium": 0, "high": 0}
        for row in risk_rows:
            lvl = (row["risk_level"] or "low").lower()
            if lvl in risk_dist:
                risk_dist[lvl] = row["cnt"]

        # ── Blocked patterns (tone issues, last 30 days) ──────────────────────
        pattern_counts: dict[str, int] = {}
        issue_rows = conn.execute(
            "SELECT tone_issues, hallucination_violations FROM outreach_events WHERE timestamp>=?",
            (now_30,),
        ).fetchall()
        for row in issue_rows:
            for field in ("tone_issues", "hallucination_violations"):
                try:
                    issues = json.loads(row[field] or "[]")
                    for issue in issues:
                        label = _normalise_issue_label(issue)
                        pattern_counts[label] = pattern_counts.get(label, 0) + 1
                except (json.JSONDecodeError, TypeError):
                    pass
        blocked_patterns = [
            {"label": k, "count": v}
            for k, v in sorted(pattern_counts.items(), key=lambda x: -x[1])
        ][:5]

        total_events = scalar("SELECT COUNT(*) FROM outreach_events")
        conn.close()

    return {
        "prospects_discovered": {"value": pd_cur,  "delta_pct": pd_delta},
        "messages_sent":        {"value": ms_cur,  "delta_pct": ms_delta},
        "reply_rate":           {"value": rr_value, "delta_pct": rr_delta},
        "meetings_booked":      {"value": mtg_cur, "delta_abs": mtg_delta},
        "funnel":               funnel,
        "risk_distribution":    risk_dist,
        "blocked_patterns":     blocked_patterns or [{"label": "No issues detected", "count": 0}],
        "_meta": {
            "total_outreach_events": total_events,
            "window_days": 7,
            "funnel_window_days": 30,
        },
    }


def _normalise_halluc_category(issue: str) -> str:
    il = issue.lower()
    if any(w in il for w in ("revenue", "funding", "valuation", "investment", "raised")):
        return "Revenue / Funding"
    if any(w in il for w in ("headcount", "employee", "team size", "staff", "growth", "workforce")):
        return "Headcount / Growth"
    if any(w in il for w in ("technolog", "stack", "platform", "tool", "software", "integrat")):
        return "Tech Stack"
    if any(w in il for w in ("product", "feature", "capability", "service", "offering")):
        return "Product Claims"
    if any(w in il for w in ("company", "brand", "founded", "headquarter", "location")):
        return "Company Facts"
    if any(w in il for w in ("award", "recogni", "certif", "partner")):
        return "Awards / Partnerships"
    return "Other Claims"


def _normalise_issue_label(issue: str) -> str:
    issue_lower = issue.lower()
    if "banned" in issue_lower or "phrase" in issue_lower:
        return "Banned phrase"
    if "subject" in issue_lower and "long" in issue_lower:
        return "Subject too long"
    if "exclamation" in issue_lower:
        return "Excessive exclamation marks"
    if "hallucin" in issue_lower or "fabricat" in issue_lower:
        return "Hallucination violation"
    if "unverifi" in issue_lower or "no basis" in issue_lower or "cannot be verified" in issue_lower:
        return "Hallucination violation"
    if "company" in issue_lower and "absent" in issue_lower:
        return "Company name missing"
    if "short" in issue_lower or "too short" in issue_lower:
        return "Response too short"
    if "missing" in issue_lower and "field" in issue_lower:
        return "Missing required fields"
    if "revenue" in issue_lower or "claim" in issue_lower:
        return "Hallucination violation"
    # Long violation text from hallucination checker — bucket it
    if len(issue) > 60:
        return "Hallucination violation"
    return issue[:40]


def get_recent_agent_events(limit: int = 20) -> list[dict]:
    with _lock:
        conn = _connect()
        rows = conn.execute(
            "SELECT agent, message, lead_id, latency_ms, success, timestamp "
            "FROM agent_events ORDER BY timestamp DESC LIMIT ?",
            (limit,),
        ).fetchall()
        conn.close()
    return [
        {
            "agent":      row["agent"],
            "message":    row["message"],
            "lead_id":    row["lead_id"],
            "latency_ms": row["latency_ms"],
            "timestamp":  _format_ts(row["timestamp"]),
        }
        for row in rows
    ]


def _format_ts(ts: str) -> str:
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        return dt.strftime("%H:%M:%S")
    except Exception:
        return ts[:8] if ts else ""


# ── Raw table access (for /dashboard/stats/raw validation endpoint) ───────────

def get_raw_outreach(limit: int = 100) -> list[dict]:
    with _lock:
        conn = _connect()
        rows = conn.execute(
            "SELECT * FROM outreach_events ORDER BY timestamp DESC LIMIT ?", (limit,)
        ).fetchall()
        conn.close()
    return [dict(r) for r in rows]


def get_raw_conversations(limit: int = 100) -> list[dict]:
    with _lock:
        conn = _connect()
        rows = conn.execute(
            "SELECT * FROM conversation_events ORDER BY timestamp DESC LIMIT ?", (limit,)
        ).fetchall()
        conn.close()
    return [dict(r) for r in rows]


def get_raw_agent_events(limit: int = 100) -> list[dict]:
    with _lock:
        conn = _connect()
        rows = conn.execute(
            "SELECT * FROM agent_events ORDER BY timestamp DESC LIMIT ?", (limit,)
        ).fetchall()
        conn.close()
    return [dict(r) for r in rows]


def get_extended_stats() -> dict:
    """Extended Mission Control stats: company breakdown, validation, intent, governance."""
    with _lock:
        conn = _connect()
        now_30 = _iso_days_ago(30)

        def scalar(sql: str, params: tuple = ()) -> int | float:
            row = conn.execute(sql, params).fetchone()
            return row[0] if row and row[0] is not None else 0

        # ── Top companies by outreach volume ──────────────────────────────────
        company_rows = conn.execute("""
            SELECT
                company_name,
                COUNT(*) AS outreach_count,
                AVG(risk_score) AS avg_risk,
                SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) AS approved_count,
                SUM(CASE WHEN tone_passed=0 OR hallucination_passed=0 THEN 1 ELSE 0 END) AS blocked_count
            FROM outreach_events
            WHERE company_name != '' AND timestamp >= ?
            GROUP BY company_name
            ORDER BY outreach_count DESC
            LIMIT 8
        """, (now_30,)).fetchall()

        company_breakdown = []
        for r in company_rows:
            reply_c = scalar("""
                SELECT COUNT(DISTINCT ce.lead_id)
                FROM conversation_events ce
                JOIN outreach_events oe ON ce.lead_id = oe.lead_id
                WHERE oe.company_name=? AND ce.timestamp>=?
            """, (r["company_name"], now_30))
            company_breakdown.append({
                "company":        r["company_name"],
                "outreach_count": r["outreach_count"],
                "approved_count": int(r["approved_count"] or 0),
                "blocked_count":  int(r["blocked_count"]  or 0),
                "avg_risk":       round(float(r["avg_risk"] or 0), 2),
                "reply_count":    int(reply_c),
            })

        # ── Intent distribution ───────────────────────────────────────────────
        intent_rows = conn.execute("""
            SELECT intent, COUNT(*) AS cnt
            FROM conversation_events
            WHERE timestamp>=? AND intent != ''
            GROUP BY intent
            ORDER BY cnt DESC
        """, (now_30,)).fetchall()
        total_intents = sum(r["cnt"] for r in intent_rows) or 1
        intent_distribution = [
            {"intent": r["intent"], "count": r["cnt"], "pct": round(r["cnt"] / total_intents * 100, 1)}
            for r in intent_rows
        ]

        # ── Validation stats ──────────────────────────────────────────────────
        total_checks = int(scalar("SELECT COUNT(*) FROM outreach_events WHERE timestamp>=?", (now_30,)))
        tone_pass    = int(scalar("SELECT COUNT(*) FROM outreach_events WHERE tone_passed=1 AND timestamp>=?", (now_30,)))
        halluc_pass  = int(scalar("SELECT COUNT(*) FROM outreach_events WHERE hallucination_passed=1 AND timestamp>=?", (now_30,)))
        both_pass    = int(scalar("SELECT COUNT(*) FROM outreach_events WHERE tone_passed=1 AND hallucination_passed=1 AND timestamp>=?", (now_30,)))
        neither      = int(scalar("SELECT COUNT(*) FROM outreach_events WHERE tone_passed=0 AND hallucination_passed=0 AND timestamp>=?", (now_30,)))

        viol_rows = conn.execute(
            "SELECT tone_issues, hallucination_violations FROM outreach_events WHERE timestamp>=?", (now_30,)
        ).fetchall()
        viol_counts: dict[str, int] = {}
        for row in viol_rows:
            for field in ("tone_issues", "hallucination_violations"):
                try:
                    for issue in json.loads(row[field] or "[]"):
                        label = _normalise_issue_label(issue)
                        viol_counts[label] = viol_counts.get(label, 0) + 1
                except (json.JSONDecodeError, TypeError):
                    pass
        violation_types = sorted(
            [{"label": k, "count": v} for k, v in viol_counts.items()],
            key=lambda x: -x["count"]
        )[:6]

        # Hallucination-specific category breakdown (from failed halluc checks only)
        halluc_viol_rows = conn.execute(
            "SELECT hallucination_violations FROM outreach_events WHERE hallucination_passed=0 AND timestamp>=?",
            (now_30,),
        ).fetchall()
        halluc_cat_counts: dict[str, int] = {}
        for row in halluc_viol_rows:
            try:
                for issue in json.loads(row["hallucination_violations"] or "[]"):
                    cat = _normalise_halluc_category(issue)
                    halluc_cat_counts[cat] = halluc_cat_counts.get(cat, 0) + 1
            except (json.JSONDecodeError, TypeError):
                pass
        hallucination_categories = sorted(
            [{"label": k, "count": v} for k, v in halluc_cat_counts.items()],
            key=lambda x: -x["count"]
        )

        validation_stats = {
            "total_checks":           total_checks,
            "tone_pass_count":        tone_pass,
            "tone_fail_count":        total_checks - tone_pass,
            "tone_pass_rate":         round(tone_pass   / max(total_checks, 1) * 100, 1),
            "halluc_pass_count":      halluc_pass,
            "halluc_fail_count":      total_checks - halluc_pass,
            "halluc_pass_rate":       round(halluc_pass / max(total_checks, 1) * 100, 1),
            "both_passed":            both_pass,
            "neither_passed":         neither,
            "violation_types":        violation_types,
            "hallucination_categories": hallucination_categories,
        }

        # ── Governance summary ────────────────────────────────────────────────
        approved = int(scalar("SELECT COUNT(*) FROM outreach_events WHERE status='approved' AND timestamp>=?", (now_30,)))
        blocked  = int(scalar("SELECT COUNT(*) FROM outreach_events WHERE (tone_passed=0 OR hallucination_passed=0) AND timestamp>=?", (now_30,)))
        pending  = int(scalar("SELECT COUNT(*) FROM outreach_events WHERE status='pending' AND timestamp>=?", (now_30,)))
        multi_attempt = int(scalar("SELECT COUNT(*) FROM outreach_events WHERE total_attempts > 1 AND timestamp>=?", (now_30,)))
        avg_att_row = conn.execute("SELECT AVG(total_attempts) FROM outreach_events WHERE timestamp>=?", (now_30,)).fetchone()
        avg_attempts = round(float(avg_att_row[0] or 1.0), 2)

        attempt_rows = conn.execute("""
            SELECT total_attempts, COUNT(*) AS cnt
            FROM outreach_events WHERE timestamp>=?
            GROUP BY total_attempts ORDER BY total_attempts
        """, (now_30,)).fetchall()

        governance_summary = {
            "total_outreach":     total_checks,
            "approved":           approved,
            "blocked":            blocked,
            "pending":            pending,
            "avg_attempts":       avg_attempts,
            "multi_attempt_count": multi_attempt,
            "multi_attempt_pct":  round(multi_attempt / max(total_checks, 1) * 100, 1),
            "attempts_distribution": [{"attempts": r["total_attempts"], "count": r["cnt"]} for r in attempt_rows],
        }

        conn.close()

    return {
        "company_breakdown":   company_breakdown,
        "intent_distribution": intent_distribution,
        "validation_stats":    validation_stats,
        "governance_summary":  governance_summary,
    }
