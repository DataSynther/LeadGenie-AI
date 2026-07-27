"""Thin client for a small language model on an OpenAI-compatible chat
endpoint — works against a local Ollama server (dev/eval) or a hosted
provider like Groq/Together (prod), since both speak the same
/chat/completions schema. Swapping providers is just env vars, no code change.

Only wired into tasks that are structurally constrained (pick-one-of-N,
fixed template) — validated against Claude Haiku on real/representative
cases before use; see the eval notes for followup_scheduler's trust email.

Disabled by default (SLM_BASE_URL unset) — every caller must check
is_configured() and fall back to Claude on any failure or when disabled.
"""
from __future__ import annotations

import logging
import os

import requests

logger = logging.getLogger(__name__)

_BASE_URL = os.getenv("SLM_BASE_URL", "").rstrip("/")
_API_KEY = os.getenv("SLM_API_KEY", "")
_MODEL = os.getenv("SLM_MODEL", "llama3.2:3b")
_TIMEOUT_S = 30


def is_configured() -> bool:
    return bool(_BASE_URL)


def chat(prompt: str, max_tokens: int = 500, temperature: float = 0.2) -> str | None:
    """Returns the raw text response, or None on any failure — callers must
    have a fallback path (e.g. Claude Haiku) ready."""
    if not _BASE_URL:
        return None
    headers = {"Content-Type": "application/json"}
    if _API_KEY:
        headers["Authorization"] = f"Bearer {_API_KEY}"
    try:
        resp = requests.post(
            f"{_BASE_URL}/chat/completions",
            headers=headers,
            json={
                "model": _MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": max_tokens,
                "temperature": temperature,
            },
            timeout=_TIMEOUT_S,
        )
        if resp.status_code != 200:
            logger.warning("SLM chat completion returned %s: %s", resp.status_code, resp.text[:300])
            return None
        return resp.json()["choices"][0]["message"]["content"].strip()
    except Exception as exc:
        logger.warning("SLM chat completion failed: %s", exc)
        return None
