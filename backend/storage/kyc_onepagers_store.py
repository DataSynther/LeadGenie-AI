"""Local JSONL store for generated KYC one-pagers."""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

STORE_DIR = Path(__file__).parent / "kyc_onepagers"
ONEPAGERS_FILE = STORE_DIR / "onepagers.jsonl"
STORE_DIR.mkdir(parents=True, exist_ok=True)


def _append(record: dict) -> None:
    with open(ONEPAGERS_FILE, "a") as f:
        f.write(json.dumps(record) + "\n")


def _read_all() -> list[dict]:
    if not ONEPAGERS_FILE.exists():
        return []
    out = []
    with open(ONEPAGERS_FILE) as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    out.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
    return out


def save_onepager(company_name: str, company_domain: str, onepager: dict, created_by: str) -> dict:
    record = {
        "onepager_id":    f"kyc_{uuid.uuid4().hex[:12]}",
        "company_name":   company_name,
        "company_domain": company_domain,
        "onepager":       onepager,
        "created_by":     created_by,
        "created_at":     datetime.now(timezone.utc).isoformat(),
    }
    _append(record)
    return record


def list_onepagers(limit: int = 50) -> list[dict]:
    records = sorted(_read_all(), key=lambda r: r.get("created_at", ""), reverse=True)
    return records[:limit]


def get_onepager(onepager_id: str) -> dict | None:
    for r in _read_all():
        if r.get("onepager_id") == onepager_id:
            return r
    return None
