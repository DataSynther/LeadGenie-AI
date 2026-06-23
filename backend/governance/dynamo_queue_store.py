"""DynamoDB-backed outreach approval queue.

Replaces the JSONL file store in production so queue items survive ECS
container replacements and CI deployments.

Schema
------
Table  : leadgenie-queue  (env: QUEUE_TABLE)
pk     : event_id         (string, table partition key)
status : "pending" | "approved" | "rejected"   (GSI pk: status-index)
timestamp : ISO-8601 string                     (GSI sk: status-index)
payload   : JSON-encoded full record (avoids DynamoDB Decimal/float issues)
"""
from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

import boto3
from boto3.dynamodb.conditions import Key

from governance.outreach_queue_store import _build_citations  # reuse citation helper

_TABLE_NAME = os.environ.get("QUEUE_TABLE", "leadgenie-queue")
_STATUS_INDEX = "status-index"


def _table():
    return boto3.resource("dynamodb").Table(_TABLE_NAME)


class DynamoOutreachQueueStore:
    """Same public interface as OutreachQueueStore, backed by DynamoDB."""

    # ------------------------------------------------------------------
    # Write
    # ------------------------------------------------------------------

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
        lead_phone: str = "",
        followup_sequence: Optional[list] = None,
    ) -> str:
        passed = attempt_history[-1].get("passed", True) if attempt_history else True
        risk_score = governance.get("risk_score", 0.0)

        if risk_score >= 0.7:
            risk_level = "high"
        elif risk_score >= 0.35:
            risk_level = "medium"
        else:
            risk_level = "low"

        citations = _build_citations(grounding_facts or {})

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

        all_issues = governance.get("issues", [])
        trigger = all_issues[0] if all_issues else ("governance_passed" if passed else "governance_failed")
        policy  = all_issues[1] if len(all_issues) > 1 else ("all_checks_passed" if passed else "review_required")

        event_id  = f"evt_{uuid.uuid4().hex[:12]}"
        timestamp = datetime.now(timezone.utc).isoformat()
        record = {
            "event_id":          event_id,
            "lead_id":           lead_id,
            "lead_name":         lead_name,
            "lead_title":        lead_title,
            "company_name":      company_name,
            "lead_email":        lead_email,
            "lead_phone":        lead_phone,
            "timestamp":         timestamp,
            "status":            "pending",
            "governance_passed": passed,
            "total_attempts":    len(attempt_history),
            "risk_level":        risk_level,
            "risk_score":        round(risk_score, 4),
            "confidence":        governance.get("confidence", 1.0 - risk_score),
            "trigger":           trigger,
            "policy":            policy,
            "email":             email,
            "content_snippet":   (email.get("body") or "")[:300],
            "checkpoints":       checkpoints,
            "citations":         citations,
            "attempt_history":   attempt_history,
            "followup_sequence": followup_sequence or [],
        }

        _table().put_item(Item={
            "pk":        event_id,
            "status":    "pending",
            "timestamp": timestamp,
            "payload":   json.dumps(record),
        })
        return event_id

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    def get_item(self, event_id: str) -> Optional[dict]:
        resp = _table().get_item(Key={"pk": event_id})
        item = resp.get("Item")
        if not item:
            return None
        return json.loads(item["payload"])

    def get_queue(self, status: Optional[str] = None) -> list[dict]:
        """Return items sorted by timestamp desc, risk_score desc as tiebreaker."""
        if status:
            resp = _table().query(
                IndexName=_STATUS_INDEX,
                KeyConditionExpression=Key("status").eq(status),
                ScanIndexForward=False,  # newest first via GSI sort key
            )
            items = resp.get("Items", [])
            result = [json.loads(i["payload"]) for i in items]
            # Secondary sort: risk_score desc within same timestamp second
            result.sort(key=lambda x: (x.get("timestamp", ""), -x.get("risk_score", 0)), reverse=True)
            return result
        else:
            # Full scan when no status filter (used by /approval-queue/export)
            paginator = _table().meta.client.get_paginator("scan")
            pages = paginator.paginate(TableName=_TABLE_NAME)
            items: list[dict] = []
            for page in pages:
                items.extend(page.get("Items", []))
            result = [json.loads(i["payload"]) for i in items]
            result.sort(key=lambda x: (x.get("timestamp", ""), -x.get("risk_score", 0)), reverse=True)
            return result

    # ------------------------------------------------------------------
    # Update helpers
    # ------------------------------------------------------------------

    def _update_payload(self, event_id: str, mutate_fn) -> bool:
        """Fetch item, apply mutate_fn(record), write back atomically."""
        resp = _table().get_item(Key={"pk": event_id})
        item = resp.get("Item")
        if not item:
            return False
        record = json.loads(item["payload"])
        mutate_fn(record)
        new_status = record.get("status", item["status"])
        _table().update_item(
            Key={"pk": event_id},
            UpdateExpression="SET #s = :s, payload = :p",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":s": new_status, ":p": json.dumps(record)},
        )
        return True

    def update_status(self, event_id: str, status: str) -> bool:
        def _mutate(rec):
            rec["status"] = status
            rec["status_updated_at"] = datetime.now(timezone.utc).isoformat()
        return self._update_payload(event_id, _mutate)

    def update_email(self, event_id: str, subject: str, body: str) -> bool:
        def _mutate(rec):
            rec["email"] = {**rec.get("email", {}), "subject": subject, "body": body}
            rec["content_snippet"] = body[:300]
            rec["manually_edited"] = True
            rec["manually_edited_at"] = datetime.now(timezone.utc).isoformat()
        return self._update_payload(event_id, _mutate)

    def update_followup_sequence(self, event_id: str, followup_sequence: list) -> bool:
        def _mutate(rec):
            rec["followup_sequence"] = followup_sequence
            rec["followup_sequence_updated_at"] = datetime.now(timezone.utc).isoformat()
        return self._update_payload(event_id, _mutate)

    def update_hallucination(self, event_id: str, hallucination_result: dict) -> bool:
        def _mutate(rec):
            cp = dict(rec.get("checkpoints", {}))
            cp["hallucination"] = {
                "ok":          hallucination_result.get("passed", True),
                "violations":  hallucination_result.get("violations", []),
                "confidence":  hallucination_result.get("confidence"),
                "explanation": hallucination_result.get("explanation", ""),
            }
            rec["checkpoints"] = cp
            rec["hallucination_rechecked_at"] = datetime.now(timezone.utc).isoformat()
        return self._update_payload(event_id, _mutate)
