"""MCP Request Lifecycle Audit — every gateway call logged with a Request ID."""
import json
import os
from collections import defaultdict
from datetime import datetime, timezone
from uuid import uuid4

import boto3
from boto3.dynamodb.conditions import Attr

_ACTIVITY_TABLE = os.environ.get("ACTIVITY_TABLE", "")
_local_log: list[dict] = []  # in-memory fallback for local dev


def generate_request_id(tool: str) -> str:
    ts  = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    uid = uuid4().hex[:8]
    return f"REQ-{ts}-{tool.upper()}-{uid}"


def _table():
    return boto3.resource("dynamodb").Table(_ACTIVITY_TABLE)


def write_entry(request_id: str, **fields) -> None:
    """Create the initial audit record when a request enters the gateway."""
    entry = {
        "request_id": request_id,
        "timestamp":  datetime.now(timezone.utc).isoformat(),
        **fields,
    }
    if _ACTIVITY_TABLE:
        try:
            _table().put_item(Item={"pk": f"REQ#{request_id}", **{
                k: (json.dumps(v) if isinstance(v, (dict, list)) else v)
                for k, v in entry.items()
            }})
        except Exception:
            pass
    _local_log.append(entry)


def update_entry(request_id: str, **fields) -> None:
    """Append governance results, decision, or outcome to an existing record."""
    if _ACTIVITY_TABLE:
        try:
            safe = {k: (json.dumps(v) if isinstance(v, (dict, list)) else v) for k, v in fields.items()}
            expr        = "SET " + ", ".join(f"#f{i} = :v{i}" for i in range(len(safe)))
            expr_names  = {f"#f{i}": k for i, k in enumerate(safe)}
            expr_values = {f":v{i}": v for i, v in enumerate(safe.values())}
            _table().update_item(
                Key={"pk": f"REQ#{request_id}"},
                UpdateExpression=expr,
                ExpressionAttributeNames=expr_names,
                ExpressionAttributeValues=expr_values,
            )
        except Exception:
            pass
    for entry in _local_log:
        if entry.get("request_id") == request_id:
            entry.update(fields)


def scan_reveals(limit: int = 200) -> list[dict]:
    """Return recent contact reveal audit records for analytics."""
    if _ACTIVITY_TABLE:
        try:
            resp = _table().scan(
                FilterExpression=Attr("tool").eq("reveal_contact"),
                Limit=limit,
            )
            return sorted(resp.get("Items", []), key=lambda x: x.get("timestamp", ""), reverse=True)
        except Exception:
            pass
    return sorted(
        [e for e in _local_log if e.get("tool") == "reveal_contact"],
        key=lambda x: x.get("timestamp", ""),
        reverse=True,
    )[:limit]


def daily_reveal_count(user_id: str) -> int:
    """Count today's reveals for a given user (local log only — approximate)."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return sum(
        1 for e in _local_log
        if e.get("tool") == "reveal_contact"
        and e.get("user_id") == user_id
        and e.get("timestamp", "").startswith(today)
        and e.get("status") == "EXECUTED"
    )
