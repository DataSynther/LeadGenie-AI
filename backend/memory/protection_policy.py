"""Protection policy: tenant isolation, access control, namespace boundaries.

Every write scoped to its access boundary.
Every read filtered by requester's scope.
Cross-scope reads are explicit and always audited.

Privacy failure mode: Lead A writes a fact → Lead B queries same entity →
retrieval returns Lead A's data. Fix: WHERE lead_id = ? before any vector search.
"""

from __future__ import annotations

SYSTEM_SCOPES = {"__system__", "__admin__", "__governance__"}


class ProtectionPolicy:
    def validate_write(self, lead_id: str, writer_scope: str) -> dict:
        """Allow write if scope matches lead_id or is a trusted system scope."""
        if writer_scope in SYSTEM_SCOPES:
            return {"allowed": True,  "reason": "system_scope"}
        if writer_scope == lead_id:
            return {"allowed": True,  "reason": "scope_match"}
        return {
            "allowed": False,
            "reason":  "namespace_violation",
            "detail":  f"Writer '{writer_scope}' cannot write to lead '{lead_id}'",
        }

    def validate_read(self, lead_id: str, reader_scope: str) -> dict:
        """Allow read if scope matches lead_id or is a trusted system scope."""
        if reader_scope in SYSTEM_SCOPES:
            return {"allowed": True,  "reason": "system_scope"}
        if reader_scope == lead_id:
            return {"allowed": True,  "reason": "scope_match"}
        return {
            "allowed": False,
            "reason":  "cross_tenant_read_blocked",
            "detail":  f"Reader '{reader_scope}' cannot access lead '{lead_id}'",
        }

    @staticmethod
    def namespace_key(lead_id: str, memory_type: str) -> str:
        """Canonical key for namespaced storage to prevent key collisions."""
        return f"{lead_id}::{memory_type}"
