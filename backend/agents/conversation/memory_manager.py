import json
from datetime import datetime
from pathlib import Path

STORAGE_DIR = Path(__file__).parent.parent.parent / "storage" / "conversations"
STORAGE_DIR.mkdir(parents=True, exist_ok=True)


class MemoryManager:
    """Persists and retrieves per-lead conversation history."""

    def store_message(self, lead_id: str, role: str, content: str) -> None:
        """Append a message to a lead's conversation history."""
        history = self.get_history(lead_id)
        history.append({
            "role": role,
            "content": content,
            "timestamp": datetime.utcnow().isoformat(),
        })
        path = STORAGE_DIR / f"{lead_id}.json"
        with open(path, "w") as f:
            json.dump(history, f, indent=2)

    def get_history(self, lead_id: str) -> list[dict]:
        """Return full conversation history for a lead."""
        path = STORAGE_DIR / f"{lead_id}.json"
        if not path.exists():
            return []
        with open(path) as f:
            return json.load(f)

    def summarize_history(self, lead_id: str) -> str:
        """Return a plain-text summary of the conversation for use in prompts."""
        history = self.get_history(lead_id)
        if not history:
            return "No prior conversation."
        lines = [f"{m['role'].upper()}: {m['content']}" for m in history[-6:]]
        return "\n".join(lines)

    def clear(self, lead_id: str) -> None:
        path = STORAGE_DIR / f"{lead_id}.json"
        if path.exists():
            path.unlink()
