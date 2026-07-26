"""DynamoDB-backed store for website visitor tracking (Leadfeeder sync).

Schema
------
Table   : leadgenie-visits  (env: VISITS_TABLE)
pk      : "VISITOR#{domain}"                    (table partition key)
gsi_pk  : "VISITOR"  (constant)                 (GSI pk: recent-index)
last_visit : ISO-8601 string                    (GSI sk: recent-index)
payload : JSON-encoded full visitor record (name, industry, visit_count,
          pageviews, last_visit, recent_visits[], first_seen, ...)

Durable and shared across ECS tasks — Leadfeeder's own API is the source
of truth but only reflects its own retention window; this table is our
own accumulating history so recent-visitor context survives regardless
of what Leadfeeder's API currently returns.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone

from boto3.dynamodb.conditions import Key

_TABLE_NAME = os.environ.get("VISITS_TABLE", "")
_RECENT_INDEX = "recent-index"

_dynamo = None


def _table():
    """Lazy — boto3/DynamoDB isn't available in local dev (VISITS_TABLE unset),
    where the /visitors endpoint just proxies Leadfeeder's live data instead."""
    global _dynamo
    if _dynamo is None and _TABLE_NAME:
        import boto3
        _dynamo = boto3.resource("dynamodb").Table(_TABLE_NAME)
    return _dynamo


def _pk(domain: str) -> str:
    return f"VISITOR#{domain.strip().lower()}"


def is_configured() -> bool:
    return bool(_TABLE_NAME)


def upsert_visitor(visitor: dict) -> None:
    """Merge a freshly-fetched Leadfeeder visitor snapshot into our store.
    Keeps the earliest known `first_seen` and merges recent_visits so
    history accumulates even if Leadfeeder's own window is shorter."""
    table = _table()
    if table is None:
        return
    domain = (visitor.get("domain") or "").strip().lower()
    if not domain:
        return

    existing = get_visitor(domain)
    now = datetime.now(timezone.utc).isoformat()
    first_seen = existing.get("first_seen") if existing else now

    merged_visits = {v.get("started_at"): v for v in ((existing or {}).get("recent_visits") or [])}
    for v in (visitor.get("recent_visits") or []):
        merged_visits[v.get("started_at")] = v
    recent_visits = sorted(
        (v for v in merged_visits.values() if v.get("started_at")),
        key=lambda v: v["started_at"], reverse=True,
    )[:20]

    record = {
        **visitor,
        "domain": domain,
        "first_seen": first_seen,
        "last_synced_at": now,
        "recent_visits": recent_visits,
    }

    table.put_item(Item={
        "pk": _pk(domain),
        "gsi_pk": "VISITOR",
        "last_visit": visitor.get("last_visit") or first_seen,
        "payload": json.dumps(record),
    })


def get_visitor(domain: str) -> dict | None:
    table = _table()
    if table is None or not domain:
        return None
    resp = table.get_item(Key={"pk": _pk(domain)})
    item = resp.get("Item")
    if not item:
        return None
    return json.loads(item["payload"])


def list_recent_visitors(limit: int = 50) -> list[dict]:
    table = _table()
    if table is None:
        return []
    resp = table.query(
        IndexName=_RECENT_INDEX,
        KeyConditionExpression=Key("gsi_pk").eq("VISITOR"),
        ScanIndexForward=False,  # most recent first
        Limit=limit,
    )
    return [json.loads(item["payload"]) for item in resp.get("Items", [])]
