"""Persistent store for leadership-generated kickoff meeting notes.

Manager/admin only. Local JSONL store — same pattern as outreach_queue_store.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from storage.base import storage_root

STORE_DIR = storage_root() / "kickoff_notes"
NOTES_FILE = STORE_DIR / "notes.jsonl"
STORE_DIR.mkdir(parents=True, exist_ok=True)


def _append(record: dict) -> None:
    with open(NOTES_FILE, "a") as f:
        f.write(json.dumps(record) + "\n")


def _read_all() -> list[dict]:
    if not NOTES_FILE.exists():
        return []
    out = []
    with open(NOTES_FILE) as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    out.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
    return out


def save_note(company_name: str, company_domain: str, note: dict, created_by: str) -> dict:
    record = {
        "note_id":        f"note_{uuid.uuid4().hex[:12]}",
        "company_name":   company_name,
        "company_domain": company_domain,
        "note":           note,
        "created_by":     created_by,
        "created_at":     datetime.now(timezone.utc).isoformat(),
    }
    _append(record)
    return record


def list_notes(limit: int = 50) -> list[dict]:
    records = sorted(_read_all(), key=lambda r: r.get("created_at", ""), reverse=True)
    return records[:limit]


def get_note(note_id: str) -> dict | None:
    for r in _read_all():
        if r.get("note_id") == note_id:
            return r
    return None
