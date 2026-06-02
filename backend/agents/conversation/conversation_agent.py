import os

from anthropic import Anthropic

from .intent_detector import IntentDetector
from .memory_manager import MemoryManager

client = Anthropic()
MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-6")
CALENDLY_URL = os.getenv("CALENDLY_URL", "https://calendly.com/leadgenie-demo/30min")


class ConversationAgent:
    """Handles multi-turn autonomous conversations with leads."""

    def __init__(self):
        self.memory = MemoryManager()
        self.intent_detector = IntentDetector()

    def handle_reply(
        self,
        lead_id: str,
        reply: str,
        context: dict,
        lead_email: str = None,
        channel: str = "email",
    ) -> dict:
        """Classify an inbound reply, generate a response, persist memory, and optionally send email."""
        self.memory.store_message(lead_id, "prospect", reply, channel=channel, direction="inbound")

        intent_result = self.intent_detector.classify(reply, lead_id=lead_id, context=context)
        intent = intent_result.get("intent", "neutral")

        response_text = self._route(lead_id, reply, intent, context, channel=channel)
        self.memory.store_message(lead_id, "sdr", response_text, channel=channel, direction="outbound")

        result = {
            "lead_id": lead_id,
            "intent": intent,
            "intent_confidence": intent_result.get("confidence"),
            "intent_signal": intent_result.get("key_signal"),
            "intent_reasoning": intent_result.get("reasoning"),
            "response": response_text,
            "conversation_length": len(self.memory.get_history(lead_id)),
        }

        if intent == "meeting_request":
            result["calendly_sent"] = True

        if channel == "email" and lead_email and intent != "unsubscribe":
            result.update(self._send_email(lead_email, reply, response_text, context))

        return result

    def handle_objection(self, lead_id: str, objection: str, context: dict) -> dict:
        """Direct objection handler kept for backward compatibility."""
        return self.handle_reply(lead_id, objection, context)

    def _route(self, lead_id: str, reply: str, intent: str, context: dict, channel: str = "email") -> str:
        if intent == "unsubscribe":
            return "Completely understood. I will remove you from our list. Sorry for the interruption."

        if intent == "meeting_request":
            first_name = (context.get("lead", {}).get("name") or "there").split()[0]
            if channel == "whatsapp":
                return f"Great, {first_name}. Here is a link to book a time that works for you: {CALENDLY_URL}"
            return f"That's great, {first_name}! Here's a link to book a time that works for you: {CALENDLY_URL}\n\nLooking forward to it!"

        if intent == "objection":
            from agents.outreach.outreach_agent import OutreachAgent

            result = OutreachAgent().respond_to_objection(context, reply)
            response = result.get("response_text") or result.get("body") or str(result)
            return self._format_for_whatsapp(response) if channel == "whatsapp" else response

        history = self.memory.summarize_history(lead_id)
        messages = self._build_messages(history)
        response = client.messages.create(
            model=MODEL,
            max_tokens=512,
            system=self._system_prompt(context, intent, channel=channel),
            messages=messages + [{"role": "user", "content": reply}],
        )
        response_text = response.content[0].text
        return self._format_for_whatsapp(response_text) if channel == "whatsapp" else response_text

    def _system_prompt(self, context: dict, intent: str, channel: str = "email") -> str:
        lead = context.get("lead", {})
        company = context.get("company", {})
        research = context.get("research", {})
        signals = context.get("signals", {})

        pain_points = research.get("pain_points", [])
        pain_text = "; ".join(pain_points[:3]) if pain_points else "not specified"
        summary = (research.get("summary") or "")[:250]
        ai_score = research.get("ai_readiness_score", "N/A")
        growth_stage = research.get("growth_stage", "unknown")
        priorities = research.get("strategic_priorities", [])
        priorities_text = "; ".join(priorities[:2]) if priorities else "not specified"
        scaling = signals.get("scaling", False)

        facts_block = (
            "Company context you know:\n"
            f"  - Summary: {summary}\n"
            f"  - Pain points: {pain_text}\n"
            f"  - Strategic priorities: {priorities_text}\n"
            f"  - Growth stage: {growth_stage} | AI readiness: {ai_score}/10 | Scaling: {scaling}\n"
            f"  - Industry: {company.get('industry')} | Size: {company.get('employee_count')} employees\n"
        )

        base = (
            f"You are an expert SDR conversing with {lead.get('name')}, "
            f"{lead.get('title')} at {company.get('name')}.\n"
            f"{facts_block}"
        )

        if channel == "whatsapp":
            base += (
                "\nThis conversation is happening on WhatsApp. Keep the response short, friendly, "
                "and conversational. Use no email formatting, no long paragraphs, and a maximum "
                "of 1-4 sentences."
            )

        if intent == "fact_question":
            return base + (
                "\nThe prospect asked a factual question. Answer it using the company context above. "
                "If you do not have the exact data, acknowledge that and offer to cover it on a call."
            )

        if intent == "neutral":
            return base + (
                "\nThe prospect gave a neutral acknowledgment. Respond warmly, add one relevant insight "
                "from their context, and keep the conversation open."
            )

        if intent == "interested":
            return base + (
                "\nThe prospect is showing genuine interest. Acknowledge their situation, reinforce why "
                "this is relevant, and suggest a brief 15-minute call if it feels natural."
            )

        return base + (
            "\nBe concise, empathetic, and move the conversation forward naturally. "
            "Reference their business context. Never be pushy."
        )

    def _build_messages(self, history_summary: str) -> list[dict]:
        return [
            {
                "role": "user",
                "content": f"Conversation so far:\n{history_summary}\n\nContinue the conversation naturally.",
            },
            {
                "role": "assistant",
                "content": "Understood. I will respond in the context of our prior exchange.",
            },
        ]

    @staticmethod
    def _format_for_whatsapp(text: str) -> str:
        cleaned = " ".join((text or "").replace("\n", " ").split())
        if not cleaned:
            return "Thanks for the reply. Happy to share more context here."

        sentences = []
        current = ""
        for char in cleaned:
            current += char
            if char in ".!?":
                sentences.append(current.strip())
                current = ""
                if len(sentences) >= 4:
                    break

        if len(sentences) < 4 and current.strip():
            sentences.append(current.strip())

        return " ".join(sentences[:4])

    def _send_email(self, lead_email: str, original_reply: str, response_text: str, context: dict) -> dict:
        from services.email_sender import EmailSender

        company_name = context.get("company", {}).get("name", "")
        email_result = EmailSender().send(
            to_email=lead_email,
            subject=f"Re: {company_name} - following up",
            body=response_text,
        )
        return {
            "email_sent": email_result.get("sent", False),
            "email_error": email_result.get("error"),
        }
