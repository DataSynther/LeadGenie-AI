"""Per-stream compact outreach memory for few-shot learning."""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from storage.base import storage_root

STORE_DIR = storage_root() / "industry_memory"
STORE_DIR.mkdir(parents=True, exist_ok=True)


class IndustryOutreachMemory:
    """Stores and retrieves compact outreach examples per stream.

    Each stream has its own JSONL file. Examples are sorted so replied entries
    appear first — they're the best few-shot teachers.
    """

    def _path(self, stream: str) -> Path:
        return STORE_DIR / f"{stream}.jsonl"

    def write(
        self,
        stream: str,
        lead_signals: dict,
        subject: str,
        hook: str,
        outcome: str = "sent",
    ) -> str:
        """Append a new outreach example to the stream file. Returns record id."""
        record_id = f"learn_{uuid.uuid4().hex[:10]}"
        record = {
            "id": record_id,
            "stream": stream,
            "ts": datetime.now(timezone.utc).isoformat(),
            "lead_signals": lead_signals,
            "subject": subject,
            "hook": hook,
            "outcome": outcome,
            "reply_sentiment": None,
            "reply_summary": None,
        }
        with open(self._path(stream), "a") as f:
            f.write(json.dumps(record) + "\n")
        return record_id

    def get_examples(self, stream: str, n: int = 2) -> list[dict]:
        """Return up to n examples for a stream, preferring replied ones."""
        path = self._path(stream)
        if not path.exists():
            return []
        records: list[dict] = []
        with open(path) as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        records.append(json.loads(line))
                    except json.JSONDecodeError:
                        pass
        records.sort(
            key=lambda r: (r.get("outcome") == "replied", r.get("ts", "")),
            reverse=True,
        )
        return records[:n]

    def update_outcome(
        self,
        record_id: str,
        stream: str,
        outcome: str,
        reply_sentiment: Optional[str] = None,
        reply_summary: Optional[str] = None,
    ) -> bool:
        """Update outcome/sentiment on an existing record (e.g. on lead reply)."""
        path = self._path(stream)
        if not path.exists():
            return False
        records: list[dict] = []
        found = False
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                    if rec.get("id") == record_id:
                        rec = dict(rec)
                        rec["outcome"] = outcome
                        if reply_sentiment is not None:
                            rec["reply_sentiment"] = reply_sentiment
                        if reply_summary is not None:
                            rec["reply_summary"] = reply_summary
                        found = True
                    records.append(rec)
                except json.JSONDecodeError:
                    pass
        if found:
            with open(path, "w") as f:
                for r in records:
                    f.write(json.dumps(r) + "\n")
        return found
