import json
from datetime import datetime
from pathlib import Path

STORAGE_DIR = Path(__file__).parent.parent.parent / "storage" / "conversations"
STORAGE_DIR.mkdir(parents=True, exist_ok=True)


class MemoryManager:
    """Persists and retrieves per-lead conversation history."""

    def store_message(
        self,
        lead_id: str,
        role: str,
        content: str,
        channel: str = "email",
        direction: str = None,
    ) -> None:
        """Append a message to a lead's conversation history."""
        if direction is None:
            direction = "inbound" if role == "prospect" else "outbound"
        history = self.get_history(lead_id)
        history.append({
            "role": role,
            "content": content,
            "channel": channel,
            "direction": direction,
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
        lines = []
        for message in history[-6:]:
            channel = message.get("channel", "email")
            direction = message.get("direction", "")
            if direction:
                prefix = f"{message['role'].upper()} [{channel}/{direction}]"
            else:
                prefix = f"{message['role'].upper()} [{channel}]"
            lines.append(f"{prefix}: {message['content']}")
        return "\n".join(lines)

    def clear(self, lead_id: str) -> None:
        path = STORAGE_DIR / f"{lead_id}.json"
        if path.exists():
            path.unlink()
