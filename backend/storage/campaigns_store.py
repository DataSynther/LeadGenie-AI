"""Persistent history of sent achievement-announcement campaigns."""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

STORE_DIR = Path(__file__).parent / "campaigns"
CAMPAIGNS_FILE = STORE_DIR / "campaigns.jsonl"
STORE_DIR.mkdir(parents=True, exist_ok=True)


def _append(record: dict) -> None:
    with open(CAMPAIGNS_FILE, "a") as f:
        f.write(json.dumps(record) + "\n")


def _read_all() -> list[dict]:
    if not CAMPAIGNS_FILE.exists():
        return []
    out = []
    with open(CAMPAIGNS_FILE) as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    out.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
    return out


def save_campaign(
    subject: str, body: str, groups: list[str], results: list[dict], created_by: str,
    attachments: list[str] | None = None,
) -> dict:
    sent = sum(1 for r in results if r.get("sent"))
    record = {
        "campaign_id":     f"camp_{uuid.uuid4().hex[:12]}",
        "subject":         subject,
        "body":            body,
        "groups":          groups,
        "attachments":     attachments or [],
        "recipient_count": len(results),
        "sent_count":      sent,
        "failed_count":    len(results) - sent,
        "results":         results,
        "created_by":      created_by,
        "created_at":      datetime.now(timezone.utc).isoformat(),
    }
    _append(record)
    return record


def list_campaigns(limit: int = 50) -> list[dict]:
    records = sorted(_read_all(), key=lambda r: r.get("created_at", ""), reverse=True)
    return records[:limit]
