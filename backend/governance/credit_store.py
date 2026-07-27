"""Hallucination re-check credit budget.

Automated hallucination checks (one per generation run) are free.
Manual re-checks triggered by the human reviewer consume one credit each.

Credits are seeded from the HALLUCINATION_CHECK_CREDITS env var (default 50)
and persisted in storage/credits.json so they survive restarts.
"""
import json
import os
from datetime import datetime, timezone

from storage.base import storage_root

CREDITS_FILE = storage_root() / "credits.json"
DEFAULT_CREDITS = int(os.getenv("HALLUCINATION_CHECK_CREDITS", "50"))


class CreditStore:

    def _read(self) -> dict:
        if not CREDITS_FILE.exists():
            data = {"total": DEFAULT_CREDITS, "used": 0}
            self._write(data)
            return data
        return json.loads(CREDITS_FILE.read_text())

    def _write(self, data: dict) -> None:
        CREDITS_FILE.parent.mkdir(parents=True, exist_ok=True)
        CREDITS_FILE.write_text(json.dumps(data, indent=2))

    def get_credits(self) -> dict:
        data = self._read()
        remaining = max(0, data["total"] - data["used"])
        return {"total": data["total"], "used": data["used"], "remaining": remaining}

    def deduct(self, amount: int = 1) -> dict:
        """Deduct credits. Raises ValueError if balance is insufficient."""
        data = self._read()
        remaining = data["total"] - data["used"]
        if remaining < amount:
            raise ValueError(
                f"Insufficient hallucination check credits: "
                f"{remaining} remaining, {amount} required"
            )
        data["used"] += amount
        data["last_deducted_at"] = datetime.now(timezone.utc).isoformat()
        self._write(data)
        return self.get_credits()

    def add(self, amount: int) -> dict:
        """Top up the credit pool (admin use)."""
        data = self._read()
        data["total"] += amount
        self._write(data)
        return self.get_credits()
