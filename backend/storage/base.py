"""Shared base path for every store module that persists local data.

In production this resolves to the EFS mount point (APP_STORAGE_DIR, set by
compute_stack.py) so data survives ECS task replacement on every deploy —
previously nothing set this, so all local JSONL/SQLite data (Mission
Control stats, FinOps, campaigns, KYC one-pagers, intent analytics, etc.)
lived on the container's ephemeral disk and was wiped on every deploy.

Locally, APP_STORAGE_DIR is unset, so this falls back to this package's own
directory — unchanged from before, and docker-compose already bind-mounts
that directory from the host for the same persistence reason.
"""
import os
from pathlib import Path

_PACKAGE_DIR = Path(__file__).parent


def storage_root() -> Path:
    override = os.environ.get("APP_STORAGE_DIR")
    return Path(override) if override else _PACKAGE_DIR
