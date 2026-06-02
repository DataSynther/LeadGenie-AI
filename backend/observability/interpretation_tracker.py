"""Tracks model interpretation patterns per prompt version.

Each time an agent completes a Claude call, its response is fingerprinted
and stored against the prompt_version. When a new response differs from
all known fingerprints beyond a similarity threshold, it is flagged as a
new interpretation — a signal that the model found a new way to interpret
the same prompt template.

Fingerprint = {angle, tone_score, length_bucket}
  angle        : first meaningful sentence (the hook/frame the model chose)
  tone_score   : density of hedge words — indicates how cautiously model responded
  length_bucket: short / medium / long

Similarity metric: word-level Jaccard on the angle field.
No embeddings needed — stays fast and free.

Fires CATEGORY_PROMPT when is_new_interpretation = True.
"""
import json
import logging
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

_STORE = Path(__file__).parent.parent / "storage" / "diagnostics" / "interpretations.jsonl"
_STORE.parent.mkdir(parents=True, exist_ok=True)

NEW_INTERP_THRESHOLD = 0.25   # Jaccard < this → genuinely new interpretation
MIN_KNOWN_BEFORE_FLAGGING = 2  # need at least 2 prior examples to compare against

_HEDGE_WORDS = re.compile(
    r"\b(might|could|perhaps|may|potentially|possibly|consider|explore|"
    r"generally|usually|typically|often|sometimes|depending)\b",
    re.IGNORECASE,
)


def _fingerprint(response_text: str) -> dict:
    text = response_text.strip()

    sentences = re.split(r"(?<=[.!?])\s+", text)
    angle = next((s.strip() for s in sentences if len(s.strip()) > 15), text[:120])

    words = max(len(text.split()), 1)
    hedge_count = len(_HEDGE_WORDS.findall(text))
    tone_score = round(min(hedge_count / (words / 50.0), 1.0), 2)

    if len(text) < 150:
        length_bucket = "short"
    elif len(text) < 400:
        length_bucket = "medium"
    else:
        length_bucket = "long"

    return {
        "angle": angle.lower(),
        "tone_score": tone_score,
        "length_bucket": length_bucket,
    }


def _jaccard(a: str, b: str) -> float:
    wa = set(re.findall(r"\b\w{3,}\b", a.lower()))
    wb = set(re.findall(r"\b\w{3,}\b", b.lower()))
    if not wa or not wb:
        return 0.0
    return len(wa & wb) / len(wa | wb)


def _load_known(prompt_version: str) -> list:
    if not _STORE.exists():
        return []
    known = []
    with open(_STORE) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
                if rec.get("prompt_version") == prompt_version:
                    known.append(rec)
            except Exception:
                continue
    return known


def check_and_record(
    prompt_version: str,
    response_text: str,
    agent: str,
    lead_id: Optional[str] = None,
) -> bool:
    """Fingerprint this response, store it, and return True if it's a new interpretation.

    A new interpretation means the model chose a framing not seen before for
    this prompt version. Fires CATEGORY_PROMPT in the caller's trace.
    """
    fp = _fingerprint(response_text)
    known = _load_known(prompt_version)

    is_new = False
    max_sim = 0.0
    if len(known) >= MIN_KNOWN_BEFORE_FLAGGING:
        sims = [_jaccard(fp["angle"], k["fingerprint"]["angle"]) for k in known]
        max_sim = max(sims) if sims else 0.0
        if max_sim < NEW_INTERP_THRESHOLD:
            is_new = True
            logger.info(
                "New interpretation for prompt_version=%s agent=%s (max_jaccard=%.3f)",
                prompt_version, agent, max_sim,
            )

    record = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "prompt_version": prompt_version,
        "agent": agent,
        "lead_id": lead_id,
        "fingerprint": fp,
        "is_new_interpretation": is_new,
        "max_similarity_to_known": round(max_sim, 3),
    }
    with open(_STORE, "a") as f:
        f.write(json.dumps(record) + "\n")

    return is_new


def get_summary() -> dict:
    """Return per-prompt-version interpretation stats for the /dev/interpretations endpoint."""
    if not _STORE.exists():
        return {}

    counts: dict = defaultdict(int)
    drift_counts: dict = defaultdict(int)
    agents_map: dict = {}
    recent_drift: dict = defaultdict(list)

    with open(_STORE) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
                pv = rec.get("prompt_version", "unknown")
                counts[pv] += 1
                agents_map[pv] = rec.get("agent", "unknown")
                if rec.get("is_new_interpretation"):
                    drift_counts[pv] += 1
                    recent_drift[pv].append({
                        "ts": rec["ts"],
                        "angle": rec["fingerprint"]["angle"][:100],
                        "lead_id": rec.get("lead_id"),
                    })
            except Exception:
                continue

    return {
        pv: {
            "total_seen": counts[pv],
            "drift_events": drift_counts[pv],
            "agent": agents_map.get(pv, "unknown"),
            "recent_drift": recent_drift.get(pv, [])[-3:],
        }
        for pv in counts
    }
