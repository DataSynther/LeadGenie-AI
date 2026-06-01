import json
from datetime import datetime
from pathlib import Path
from uuid import uuid4

AUDIT_DIR = Path(__file__).parent.parent / "storage" / "audit_logs"
AUDIT_DIR.mkdir(parents=True, exist_ok=True)


class AuditLogger:
    """Writes immutable audit events for all governed AI decisions."""

    def log_event(self, event_type: str, lead_id: str, payload: dict, decision: str = "pending") -> str:
        """Record a governance event and return the event ID."""
        event_id = str(uuid4())
        event = {
            "event_id": event_id,
            "event_type": event_type,
            "lead_id": lead_id,
            "decision": decision,
            "payload": payload,
            "timestamp": datetime.utcnow().isoformat(),
        }
        path = AUDIT_DIR / f"{lead_id}.jsonl"
        with open(path, "a") as f:
            f.write(json.dumps(event) + "\n")
        return event_id

    def get_audit_trail(self, lead_id: str) -> list[dict]:
        """Return all audit events for a specific lead."""
        path = AUDIT_DIR / f"{lead_id}.jsonl"
        if not path.exists():
            return []
        events = []
        with open(path) as f:
            for line in f:
                events.append(json.loads(line.strip()))
        return events

    def update_decision(self, lead_id: str, event_id: str, decision: str) -> bool:
        """Update the decision field on a specific audit event (human approval)."""
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
