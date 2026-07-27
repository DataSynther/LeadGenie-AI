import json
import os
from datetime import datetime
from uuid import uuid4

import boto3
from boto3.dynamodb.conditions import Attr

from storage.base import storage_root

AUDIT_DIR = storage_root() / "audit_logs"
AUDIT_DIR.mkdir(parents=True, exist_ok=True)

_ACTIVITY_TABLE = os.environ.get("ACTIVITY_TABLE", "")


def _table():
    return boto3.resource("dynamodb").Table(_ACTIVITY_TABLE)


class AuditLogger:
    """Writes immutable audit events for all governed AI decisions."""

    def log_event(self, event_type: str, lead_id: str, payload: dict, decision: str = "pending") -> str:
        """Record a governance event and return the event ID."""
        event_id = str(uuid4())
        ts = datetime.utcnow().isoformat()
        event = {
            "event_id":   event_id,
            "event_type": event_type,
            "lead_id":    lead_id,
            "decision":   decision,
            "payload":    payload,
            "timestamp":  ts,
        }
        if _ACTIVITY_TABLE:
            _table().put_item(Item={
                "pk":         f"AUDIT#{lead_id}#{event_id}",
                "event_id":   event_id,
                "event_type": event_type,
                "lead_id":    lead_id,
                "decision":   decision,
                "payload":    json.dumps(payload),
                "timestamp":  ts,
            })
        else:
            path = AUDIT_DIR / f"{lead_id}.jsonl"
            with open(path, "a") as f:
                f.write(json.dumps(event) + "\n")
        return event_id

    def get_audit_trail(self, lead_id: str) -> list[dict]:
        """Return all audit events for a specific lead, sorted by timestamp."""
        if _ACTIVITY_TABLE:
            resp = _table().scan(
                FilterExpression=Attr("pk").begins_with(f"AUDIT#{lead_id}#")
            )
            items = resp.get("Items", [])
            result = []
            for item in items:
                payload = item.get("payload", "{}")
                result.append({
                    "event_id":   item["event_id"],
                    "event_type": item["event_type"],
                    "lead_id":    item["lead_id"],
                    "decision":   item.get("decision", "pending"),
                    "payload":    json.loads(payload) if isinstance(payload, str) else payload,
                    "timestamp":  item["timestamp"],
                })
            result.sort(key=lambda x: x.get("timestamp", ""))
            return result
        else:
            path = AUDIT_DIR / f"{lead_id}.jsonl"
            if not path.exists():
                return []
            events = []
            with open(path) as f:
                for line in f:
                    line = line.strip()
                    if line:
                        events.append(json.loads(line))
            return events

    def update_decision(self, lead_id: str, event_id: str, decision: str) -> bool:
        """Update the decision field on a specific audit event (human approval)."""
        if _ACTIVITY_TABLE:
            try:
                _table().update_item(
                    Key={"pk": f"AUDIT#{lead_id}#{event_id}"},
                    UpdateExpression="SET #d = :d, reviewed_at = :r",
                    ExpressionAttributeNames={"#d": "decision"},
                    ExpressionAttributeValues={
                        ":d": decision,
                        ":r": datetime.utcnow().isoformat(),
                    },
                )
                return True
            except Exception:
                return False
        else:
            path = AUDIT_DIR / f"{lead_id}.jsonl"
            if not path.exists():
                return False
            events = self.get_audit_trail(lead_id)
            updated = False
            with open(path, "w") as f:
                for event in events:
                    if event["event_id"] == event_id:
                        event["decision"] = decision
                        event["reviewed_at"] = datetime.utcnow().isoformat()
                        updated = True
                    f.write(json.dumps(event) + "\n")
            return updated

    # ── Lineage index (used by /pipeline/lineage GET) ─────────────────────────

    def get_all_lead_ids(self) -> list[dict]:
        """Return list of {lead_id, timestamp, decision} for all leads with audit events."""
        if _ACTIVITY_TABLE:
            resp = _table().scan(
                FilterExpression=Attr("pk").begins_with("AUDIT#"),
                ProjectionExpression="lead_id, #ts, decision, event_type",
                ExpressionAttributeNames={"#ts": "timestamp"},
            )
            items = resp.get("Items", [])
            # Deduplicate: keep the latest event per lead_id
            by_lead: dict = {}
            for item in items:
                lid = item.get("lead_id", "")
                if lid not in by_lead or item.get("timestamp", "") > by_lead[lid].get("timestamp", ""):
                    by_lead[lid] = item
            return sorted(by_lead.values(), key=lambda x: x.get("timestamp", ""), reverse=True)
        else:
            result = []
            for f in sorted(AUDIT_DIR.glob("*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True):
                lead_id = f.stem
                try:
                    with open(f) as fh:
                        first_line = fh.readline().strip()
                    if first_line:
                        ev = json.loads(first_line)
                        result.append({
                            "lead_id":   lead_id,
                            "timestamp": ev.get("timestamp", ""),
                            "decision":  ev.get("decision", "unknown"),
                        })
                except Exception:
                    continue
            return result
