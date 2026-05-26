import json
import os
from anthropic import Anthropic
from .memory_manager import MemoryManager

client = Anthropic()
MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-6")


class ConversationAgent:
    """Handles multi-turn autonomous conversations with leads."""

    def __init__(self):
        self.memory = MemoryManager()

    def handle_reply(self, lead_id: str, reply: str, context: dict) -> dict:
        """Process an inbound reply and generate the next outreach message."""
        self.memory.store_message(lead_id, "prospect", reply)
        history = self.memory.summarize_history(lead_id)

        messages = self._build_messages(history, context)
        response = client.messages.create(
            model=MODEL,
            max_tokens=512,
            system=self._system_prompt(context),
            messages=messages + [{"role": "user", "content": reply}],
        )
        reply_text = response.content[0].text
        self.memory.store_message(lead_id, "sdr", reply_text)

        return {
            "lead_id": lead_id,
            "response": reply_text,
            "conversation_length": len(self.memory.get_history(lead_id)),
        }

    def handle_objection(self, lead_id: str, objection: str, context: dict) -> dict:
        """Specifically handle a detected objection with empathy and reframing."""
        from agents.outreach.outreach_agent import OutreachAgent
        outreach = OutreachAgent()
        result = outreach.respond_to_objection(context, objection)
        self.memory.store_message(lead_id, "sdr", result.get("response_text", ""))
        return result

    def _system_prompt(self, context: dict) -> str:
        lead = context.get("lead", {})
        company = context.get("company", {})
        return (
            f"You are an expert SDR having a conversation with {lead.get('name')}, "
            f"{lead.get('title')} at {company.get('name')}. "
            "Be concise, empathetic, and always move toward booking a meeting. "
            "Never be pushy. Reference their business context when relevant."
        )

    def _build_messages(self, history_summary: str, context: dict) -> list[dict]:
        return [
            {
                "role": "user",
                "content": f"Conversation so far:\n{history_summary}\n\nContinue the conversation.",
            },
            {
                "role": "assistant",
                "content": "Understood. I'll respond in context of our prior exchange.",
            },
        ]
