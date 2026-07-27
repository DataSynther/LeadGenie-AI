"""Campaign subscriber store — audiences for achievement-announcement broadcasts.

Each subscriber belongs to one or more groups (discipline / technology / vertical).
Local JSONL store, seeded with example subscribers on first read so there's
something to select and send to out of the box.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from storage.base import storage_root

STORE_DIR = storage_root() / "campaigns"
SUBSCRIBERS_FILE = STORE_DIR / "subscribers.jsonl"
STORE_DIR.mkdir(parents=True, exist_ok=True)

# Fixed group taxonomy — disciplines, technologies, and verticals.
CAMPAIGN_GROUPS: list[str] = [
    "data_engineering",
    "data_science",
    "cloud",
    "data_warehouses",
    "devops",
    "product",
    "fintech",
    "healthcare",
    "ecommerce",
    "manufacturing",
    "logistics",
    "generic",
]

# Example subscribers seeded on first use — safe example.com addresses so a
# test send never reaches a real inbox. Add real subscribers via the UI.
_SEED_SUBSCRIBERS: list[dict] = [
    {"email": "priya.dataeng@example.com",  "name": "Priya (Data Eng Lead)",      "groups": ["data_engineering", "cloud", "data_warehouses"]},
    {"email": "marcus.mlops@example.com",   "name": "Marcus (ML Platform)",       "groups": ["data_science", "cloud", "devops"]},
    {"email": "jane.cto@example.com",       "name": "Jane (Fintech CTO)",         "groups": ["fintech", "data_engineering"]},
    {"email": "ravi.health@example.com",    "name": "Ravi (Healthcare Data)",     "groups": ["healthcare", "data_science"]},
    {"email": "sam.retail@example.com",     "name": "Sam (Ecommerce Analytics)",  "groups": ["ecommerce", "data_warehouses"]},
    {"email": "lena.ops@example.com",       "name": "Lena (Manufacturing Ops)",   "groups": ["manufacturing", "cloud"]},
    {"email": "arun.logistics@example.com", "name": "Arun (Logistics Platform)",  "groups": ["logistics", "data_engineering"]},
    {"email": "dana.product@example.com",   "name": "Dana (Product Lead)",        "groups": ["product", "generic"]},
]


def _append(record: dict) -> None:
    with open(SUBSCRIBERS_FILE, "a") as f:
        f.write(json.dumps(record) + "\n")


def _read_all() -> list[dict]:
    if not SUBSCRIBERS_FILE.exists():
        _seed()
    out = []
    with open(SUBSCRIBERS_FILE) as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    out.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
    return out


def _seed() -> None:
    for s in _SEED_SUBSCRIBERS:
        _append({
            "subscriber_id": f"sub_{uuid.uuid4().hex[:12]}",
            "email": s["email"],
            "name": s["name"],
            "groups": s["groups"],
            "added_at": datetime.now(timezone.utc).isoformat(),
        })


def list_subscribers(group: str | None = None) -> list[dict]:
    subs = _read_all()
    if group:
        subs = [s for s in subs if group in (s.get("groups") or [])]
    return subs


def group_counts() -> dict[str, int]:
    subs = _read_all()
    counts = {g: 0 for g in CAMPAIGN_GROUPS}
    for s in subs:
        for g in (s.get("groups") or []):
            if g in counts:
                counts[g] += 1
    return counts


def add_subscriber(email: str, name: str, groups: list[str]) -> dict:
    valid_groups = [g for g in groups if g in CAMPAIGN_GROUPS]
    record = {
        "subscriber_id": f"sub_{uuid.uuid4().hex[:12]}",
        "email": email.strip().lower(),
        "name": name.strip() or email,
        "groups": valid_groups,
        "added_at": datetime.now(timezone.utc).isoformat(),
    }
    _append(record)
    return record


def resolve_recipients(groups: list[str]) -> list[dict]:
    """Union of subscribers in any of the given groups, deduped by email."""
    subs = _read_all()
    wanted = set(groups)
    seen_emails: set[str] = set()
    recipients: list[dict] = []
    for s in subs:
        email = s.get("email", "").lower()
        if not email or email in seen_emails:
            continue
        if wanted & set(s.get("groups") or []):
            seen_emails.add(email)
            recipients.append(s)
    return recipients
