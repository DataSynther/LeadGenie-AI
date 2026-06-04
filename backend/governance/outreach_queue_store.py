"""Persistent store for the outreach approval queue.

Every generated email is written here regardless of governance outcome.
Status lifecycle: pending → approved | rejected
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Dict

STORE_DIR = Path(__file__).parent.parent / "storage" / "outreach_queue"
QUEUE_FILE = STORE_DIR / "queue.jsonl"
STORE_DIR.mkdir(parents=True, exist_ok=True)

# ── Field → source mapping for citation generation ───────────────────────────

_FIELD_SOURCES: dict[str, tuple[str, str]] = {
    "lead_name":             ("Apollo People API",   "lead.name"),
    "lead_title":            ("Apollo People API",   "lead.title"),
    "lead_seniority":        ("Apollo People API",   "lead.seniority"),
    "company_name":          ("Apollo Company API",  "company.name"),
    "industry":              ("Apollo Company API",  "company.industry"),
    "employee_count":        ("Apollo Company API",  "company.employee_count"),
    "technologies":          ("Apollo Company API",  "company.technologies"),
    "description":           ("Apollo Company API",  "company.description"),
    "revenue":               ("Apollo Company API",  "company.revenue"),
    "founded_year":          ("Apollo Company API",  "company.founded_year"),
    "funding_stage":         ("Apollo Company API",  "company.funding_stage"),
    "headcount_growth_6m":   ("Apollo Signals API",  "signals.headcount_growth_6m"),
    "headcount_growth_12m":  ("Apollo Signals API",  "signals.headcount_growth_12m"),
    "open_roles":            ("Apollo Signals API",  "signals.open_roles"),
    "ai_hiring":             ("Apollo Signals API",  "signals.ai_hiring"),
    "scaling_signal":        ("Apollo Signals API",  "signals.scaling_signal"),
    "summary":               ("Research Agent",      "research.summary"),
    "pain_points":           ("Research Agent",      "research.pain_points"),
    "priorities":            ("Research Agent",      "research.priorities"),
    "growth_stage":          ("Research Agent",      "research.growth_stage"),
    "ai_readiness":          ("Research Agent",      "research.ai_readiness"),
    "top_trends":            ("Trend Agent",         "trends.top_k"),
}


def _build_citations(grounding_facts: dict) -> dict:
    """Convert flat grounding facts into citation entries with provenance + URL."""
    # Extract URL anchors from the fact set
    lead_url    = grounding_facts.get("lead_linkedin_url") or None
    company_url = (
        grounding_facts.get("company_linkedin_url")
        or grounding_facts.get("company_website")
        or None
    )
    # Prefix http if bare domain
    if company_url and not company_url.startswith("http"):
        company_url = f"https://{company_url}"

    _SOURCE_URL: dict[str, Optional[str]] = {
        "Apollo People API":  lead_url,
        "Apollo Company API": company_url,
        "Apollo Signals API": company_url,
        "Research Agent":     None,
        "Trend Agent":        None,
    }

    out: dict = {}
    for field, value in grounding_facts.items():
        if field.startswith("_") or field in ("lead_linkedin_url", "company_linkedin_url", "company_website"):
            continue
        source, path = _FIELD_SOURCES.get(field, ("Research Agent", f"research.{field}"))
        display = value
        if isinstance(value, list):
            display = value[:5]

        entry: dict = {"value": display, "source": source, "field": path}

        # Attach URL from the source anchor
        url = _SOURCE_URL.get(source)
        if url:
            entry["url"] = url

        # Top trends: individual trend URLs if present
        if field == "top_trends" and isinstance(value, list):
            urls = [t.get("url") for t in value if isinstance(t, dict) and t.get("url")]
            if urls:
                entry["url"] = urls[0]   # use first trend URL as representative

        out[field] = entry
    return out


def _append(record: dict) -> None:
    with open(QUEUE_FILE, "a") as f:
        f.write(json.dumps(record) + "\n")


def _read_all() -> list[dict]:
    if not QUEUE_FILE.exists():
        return []
    out = []
    with open(QUEUE_FILE) as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    out.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
    return out


class OutreachQueueStore:

    def enqueue(
        self,
        lead_id: str,
        lead_name: str,
        lead_title: str,
        company_name: str,
        email: dict,
        governance: dict,
        attempt_history: list[dict],
        grounding_facts: Optional[dict] = None,
        lead_email: str = "",
    ) -> str:
        """Write an email to the queue. Returns the event_id."""
        passed = attempt_history[-1].get("passed", True) if attempt_history else True
        risk_score = governance.get("risk_score", 0.0)

        if risk_score >= 0.7:
            risk_level = "high"
        elif risk_score >= 0.35:
            risk_level = "medium"
        else:
            risk_level = "low"

        # Build real citations from grounding facts
        citations = _build_citations(grounding_facts or {})

        # Extract validator checkpoints from the last attempt
        last_attempt = attempt_history[-1] if attempt_history else {}
        layers = last_attempt.get("layers", {})
        val_cp = layers.get("validator", {}).get("checkpoints", {})
        halluc = layers.get("hallucination", {})
        checkpoints = {
            "shape":   val_cp.get("shape",   {"ok": True, "issues": []}),
            "context": val_cp.get("context", {"ok": True, "issues": []}),
            "policy":  val_cp.get("policy",  {"ok": True, "issues": []}),
            "hallucination": {
                "ok": halluc.get("passed", True),
                "violations": halluc.get("violations", []),
                "confidence": halluc.get("confidence"),
                "explanation": halluc.get("explanation", ""),
            },
        }

        # Derive trigger / policy description from issues
        all_issues = governance.get("issues", [])
        trigger = all_issues[0] if all_issues else ("governance_passed" if passed else "governance_failed")
        policy  = all_issues[1] if len(all_issues) > 1 else ("all_checks_passed" if passed else "review_required")

        event_id = f"evt_{uuid.uuid4().hex[:12]}"
        record = {
            "event_id":      event_id,
            "lead_id":       lead_id,
            "lead_name":     lead_name,
            "lead_title":    lead_title,
            "company_name":  company_name,
            "lead_email":    lead_email,
            "timestamp":     datetime.now(timezone.utc).isoformat(),
            "status":        "pending",
            "governance_passed": passed,
            "total_attempts": len(attempt_history),
            "risk_level":    risk_level,
            "risk_score":    round(risk_score, 4),
            "confidence":    governance.get("confidence", 1.0 - risk_score),
            "trigger":       trigger,
            "policy":        policy,
            "email":         email,
            "content_snippet": (email.get("body") or "")[:300],
            "checkpoints":   checkpoints,
            "citations":     citations,
            "attempt_history": attempt_history,
        }
        _append(record)
        return event_id

    def get_item(self, event_id: str) -> Optional[dict]:
        """Return the latest record for a single event_id."""
        items = _read_all()
        match = None
        for item in items:
            if item.get("event_id") == event_id:
                match = item
        return match

    def get_queue(self, status: Optional[str] = None) -> list[dict]:
        """Return items sorted by risk_score desc, then timestamp desc."""
        items = _read_all()
        # Deduplicate: keep latest record per event_id
        seen: dict[str, dict] = {}
        for item in items:
            seen[item["event_id"]] = item
        items = list(seen.values())

        if status:
            items = [i for i in items if i.get("status") == status]

        items.sort(key=lambda x: (-x.get("risk_score", 0), x.get("timestamp", "")), reverse=False)
        return items

    def update_email(self, event_id: str, subject: str, body: str) -> bool:
        """Overwrite the email subject + body for an item (human manual edit)."""
        items = _read_all()
        found = False
        updated: list[dict] = []
        for item in items:
            if item.get("event_id") == event_id:
                item = dict(item)
                item["email"] = {**item.get("email", {}), "subject": subject, "body": body}
                item["content_snippet"] = body[:300]
                item["manually_edited"] = True
                item["manually_edited_at"] = datetime.now(timezone.utc).isoformat()
                found = True
            updated.append(item)
        if found:
            with open(QUEUE_FILE, "w") as f:
                for rec in updated:
                    f.write(json.dumps(rec) + "\n")
        return found

    def update_hallucination(self, event_id: str, hallucination_result: dict) -> bool:
        """Update the hallucination checkpoint after a manual re-check."""
        items = _read_all()
        found = False
        updated: list[dict] = []
        for item in items:
            if item.get("event_id") == event_id:
                item = dict(item)
                cp = dict(item.get("checkpoints", {}))
                cp["hallucination"] = {
                    "ok":          hallucination_result.get("passed", True),
                    "violations":  hallucination_result.get("violations", []),
                    "confidence":  hallucination_result.get("confidence"),
                    "explanation": hallucination_result.get("explanation", ""),
                }
                item["checkpoints"] = cp
                item["hallucination_rechecked_at"] = datetime.now(timezone.utc).isoformat()
                found = True
            updated.append(item)
        if found:
            with open(QUEUE_FILE, "w") as f:
                for rec in updated:
                    f.write(json.dumps(rec) + "\n")
        return found

    def update_status(self, event_id: str, status: str) -> bool:
        """Rewrite queue file updating status for one event_id."""
        items = _read_all()
        found = False
        updated: list[dict] = []
        for item in items:
            if item.get("event_id") == event_id:
                item = dict(item)
                item["status"] = status
                item["status_updated_at"] = datetime.now(timezone.utc).isoformat()
                found = True
            updated.append(item)

        if found:
            with open(QUEUE_FILE, "w") as f:
                for rec in updated:
                    f.write(json.dumps(rec) + "\n")
        return found
