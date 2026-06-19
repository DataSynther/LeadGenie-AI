"""MCP Gateway — the Decision Control Plane.

Agents propose. Gateway decides.

READ tools  → pass through immediately, no governance.
WRITE tools → policy check → misuse check → governance evaluation
              → APPROVE / DEFER / BLOCK → execute or queue.

Every request (READ or WRITE) receives a Request ID and is logged end-to-end.
"""
import os
import time
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Callable, Optional

from mcp.registry import TOOL_REGISTRY
from mcp import audit as mcp_audit

REVEAL_RATE_LIMIT = int(os.getenv("REVEAL_RATE_LIMIT", "10"))   # max reveals per 60s window
REVEAL_WINDOW_S   = int(os.getenv("REVEAL_WINDOW_S", "60"))
DAILY_REVEAL_MAX  = int(os.getenv("DAILY_REVEAL_MAX", "50"))
RISK_DEFER_FLOOR  = float(os.getenv("RISK_DEFER_FLOOR", "0.4"))
RISK_BLOCK_FLOOR  = float(os.getenv("RISK_BLOCK_FLOOR", "0.7"))

# Sliding-window reveal log: user_id → list of epoch timestamps
_reveal_window: dict[str, list[float]] = defaultdict(list)


class GovernanceBlockError(Exception):
    def __init__(self, request_id: str, reason: str):
        self.request_id = request_id
        self.reason = reason
        super().__init__(f"[{request_id}] BLOCKED: {reason}")


class MCPGateway:
    """All agent tool calls route through here."""

    def __init__(self):
        from governance.risk_engine import RiskEngine
        from governance.tone_validator import ToneValidator
        from governance.hallucination_checker import HallucinationChecker
        self._risk   = RiskEngine()
        self._tone   = ToneValidator()
        self._halluc = HallucinationChecker()

    # ─────────────────────────────────────────────────────────────────────────
    def call(
        self,
        tool: str,
        params: dict,
        *,
        user_id: str = "default",
        lead_id: str = "",
        source_facts: Optional[list] = None,
        executor: Optional[Callable[[dict], Any]] = None,
    ) -> dict:
        """Route a tool call through the gateway. Returns execution result or
        a deferred/blocked status dict."""

        if tool not in TOOL_REGISTRY:
            raise ValueError(f"Unknown tool '{tool}'. Register it in mcp/registry.py first.")

        tool_def   = TOOL_REGISTRY[tool]
        request_id = mcp_audit.generate_request_id(tool)

        mcp_audit.write_entry(
            request_id,
            tool=tool,
            tool_type=tool_def["type"],
            user_id=user_id,
            lead_id=lead_id,
            status="PENDING",
            params_summary=str(params)[:200],
        )

        # ── READ — straight through ───────────────────────────────────────────
        if tool_def["type"] == "READ":
            result = executor(params) if executor else {}
            mcp_audit.update_entry(request_id, status="EXECUTED", decision="PASS_THROUGH")
            return result

        # ── WRITE — misuse guard ──────────────────────────────────────────────
        misuse_reason = self._check_misuse(user_id, tool)
        if misuse_reason:
            mcp_audit.update_entry(request_id, status="BLOCKED", decision="BLOCK",
                                   block_reason=misuse_reason)
            raise GovernanceBlockError(request_id, misuse_reason)

        # ── WRITE — governance evaluation ─────────────────────────────────────
        content = params.get("content", str(params)[:500])
        checks: dict = {}

        tone = self._tone.validate({"body": content, "subject": params.get("subject", "")})
        checks["tone"] = {"passed": tone.get("passed", True), "issues": tone.get("issues", [])}

        sf = {f"fact_{i}": f for i, f in enumerate(source_facts or [])}
        halluc = self._halluc.check(content, sf or None)
        checks["hallucination"] = {
            "passed":     halluc.get("passed", True),
            "confidence": halluc.get("confidence", 1.0),
        }

        risk = self._risk.evaluate(
            {"subject": params.get("subject", ""), "body": content}, halluc, 1.0
        )
        checks["risk_score"] = risk.get("risk_score", 0.0)

        mcp_audit.update_entry(request_id, checks=checks)

        # ── Decision ──────────────────────────────────────────────────────────
        rs       = checks["risk_score"]
        tone_ok  = checks["tone"]["passed"]
        hall_ok  = checks["hallucination"]["passed"]

        if rs > RISK_BLOCK_FLOOR or not hall_ok:
            decision = "BLOCK"
        elif rs < RISK_DEFER_FLOOR and tone_ok:
            decision = "APPROVE"
        else:
            decision = "DEFER"

        mcp_audit.update_entry(request_id, decision=decision)

        if decision == "BLOCK":
            mcp_audit.update_entry(request_id, status="BLOCKED",
                                   block_reason=f"risk={rs:.2f}, hallucination_passed={hall_ok}")
            raise GovernanceBlockError(request_id,
                                       f"risk_score={rs:.2f}, hallucination_passed={hall_ok}")

        if decision == "DEFER":
            mcp_audit.update_entry(request_id, status="DEFERRED")
            return {
                "status":     "deferred",
                "request_id": request_id,
                "decision":   "DEFER",
                "checks":     checks,
            }

        # APPROVE — execute
        if tool == "reveal_contact":
            _reveal_window[user_id].append(time.time())

        result = executor(params) if executor else {}
        mcp_audit.update_entry(request_id, status="EXECUTED", outcome="success")
        return {
            **result,
            "request_id": request_id,
            "decision":   "APPROVE",
            "checks":     checks,
        }

    # ─────────────────────────────────────────────────────────────────────────
    def _check_misuse(self, user_id: str, tool: str) -> Optional[str]:
        """Sliding-window rate limit + daily cap for write tools."""
        if tool != "reveal_contact":
            return None

        now   = time.time()
        cutoff = now - REVEAL_WINDOW_S
        recent = [t for t in _reveal_window[user_id] if t > cutoff]
        _reveal_window[user_id] = recent

        if len(recent) >= REVEAL_RATE_LIMIT:
            return (f"Rate limit: {len(recent)} reveals in {REVEAL_WINDOW_S}s "
                    f"(max {REVEAL_RATE_LIMIT})")

        daily = mcp_audit.daily_reveal_count(user_id)
        if daily >= DAILY_REVEAL_MAX:
            return f"Daily cap reached: {daily} reveals today (max {DAILY_REVEAL_MAX})"

        return None


# Module-level singleton
_gateway: Optional[MCPGateway] = None


def get_gateway() -> MCPGateway:
    global _gateway
    if _gateway is None:
        _gateway = MCPGateway()
    return _gateway
