"""
Activity Tracker Middleware

Updates DynamoDB `last_activity` on every incoming request so the
sleep checker Lambda knows when the system was last used.

Writes at most once per 60 seconds to avoid DynamoDB hot-key issues.
"""
import os
import time
from datetime import datetime, timezone
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

_dynamo        = None
_last_write_ts = 0.0
_WRITE_INTERVAL = 60          # seconds between DynamoDB writes
_TABLE_NAME     = os.environ.get("ACTIVITY_TABLE", "")

# Paths that don't count as user activity
_SKIP_PATHS = {"/health", "/metrics", "/favicon.ico"}


def _get_table():
    global _dynamo
    if _dynamo is None and _TABLE_NAME:
        import boto3  # lazy — not available in local/non-AWS environments
        _dynamo = boto3.resource("dynamodb").Table(_TABLE_NAME)
    return _dynamo


class ActivityTrackerMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        # Only track on successful, non-health-check requests
        if (
            _TABLE_NAME
            and request.url.path not in _SKIP_PATHS
            and response.status_code < 500
        ):
            self._maybe_update()

        return response

    @staticmethod
    def _maybe_update():
        global _last_write_ts
        now = time.monotonic()
        if now - _last_write_ts < _WRITE_INTERVAL:
            return

        table = _get_table()
        if table is None:
            return

        try:
            ts = datetime.now(timezone.utc).isoformat()
            # TTL: keep record for 24h so it survives a sleep cycle
            ttl = int(time.time()) + 86_400
            table.put_item(Item={"pk": "last_activity", "timestamp": ts, "ttl": ttl})
            _last_write_ts = now
        except Exception as exc:
            # Never crash the request pipeline due to tracking failure
            print(f"[activity_tracker] DynamoDB write failed: {exc}")
