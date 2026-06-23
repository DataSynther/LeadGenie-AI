"""Shared Redis client — reads REDIS_URL from env, handles rediss:// TLS.

Falls back to None when REDIS_URL is not set (local dev without Redis).
Callers must guard: `r = get_redis(); if r is None: <fallback>`.
"""
from __future__ import annotations
import os
import logging

logger = logging.getLogger(__name__)

_client = None


def get_redis():
    """Return a connected Redis client, or None if REDIS_URL is not configured."""
    global _client
    if _client is not None:
        return _client
    url = os.getenv("REDIS_URL")
    if not url:
        return None
    try:
        import redis
        _client = redis.from_url(
            url,
            decode_responses=True,
            socket_connect_timeout=3,
            socket_timeout=3,
            ssl_cert_reqs=None,  # ElastiCache uses self-signed cert
        )
        _client.ping()
        logger.info("Redis connected: %s", url.split("@")[-1])
    except Exception as exc:
        logger.warning("Redis unavailable (%s) — falling back to local storage", exc)
        _client = None
    return _client
