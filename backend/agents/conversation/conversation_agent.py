import json
import os
from anthropic import Anthropic
from .memory_manager import MemoryManager
from .intent_detector import IntentDetector

from observability.agent_tracer import AgentTracer
from observability.validator import Validator
from observability.self_evaluator import self_evaluate, context_to_summary
from memory.sender_kb import SenderKnowledgeBase

client = Anthropic()
MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-6")
CALENDLY_URL = os.getenv("CALENDLY_URL", "https://calendly.com/leadgenie-demo/30min")

_sender_kb = SenderKnowledgeBase()

_GANIT_IDENTITY = (
    "You represent Ganit — a full-stack Data & AI company recognized by Everest Group, "
    "Forrester, and Analytics India Magazine. Ganit has 300+ data specialists and is an "
    "AWS 6-year partner, SOC-2 and ISO 27001 certified."
)


class ConversationAgent:
    """Handles multi-turn autonomous conversations with leads.

    Automatically detects reply intent and routes to the right response strategy:
    - fact_question / neutral  → context-grounded answer using research data
    - interested               → warm acknowledgment + meeting CTA
    - meeting_request          → Calendly link
    - objection                → empathetic reframe via OutreachAgent
    - unsubscribe              → respectful opt-out
    """

    def __init__(self):
        self.memory = MemoryManager()
        self.intent_detector = IntentDetector()

    def handle_reply(self, lead_id: str, reply: str, context: dict, lead_email: str = None) -> dict:
        """Process an inbound reply end-to-end: classify intent → generate response → (optionally) send email."""
        self.memory.store_message(lead_id, "prospect", reply)

        intent_result = self.intent_detector.classify(reply, lead_id=lead_id, context=context)
        intent = intent_result.get("intent", "neutral")

        response_text = self._route(lead_id, reply, intent, context)
        self.memory.store_message(lead_id, "sdr", response_text)

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

        if lead_email and intent != "unsubscribe":
            result.update(self._send_email(lead_email, reply, response_text, context))

        return result

    def handle_objection(self, lead_id: str, objection: str, context: dict) -> dict:
        """Direct objection handler kept for backward compatibility."""
        return self.handle_reply(lead_id, objection, context)

    # ── Routing ──────────────────────────────────────────────────────────────

    def _route(self, lead_id: str, reply: str, intent: str, context: dict) -> str:
        if intent == "unsubscribe":
            return "Completely understood — I'll remove you from our list. Sorry for any interruption, and best of luck with your work."

        if intent == "meeting_request":
            first_name = (context.get("lead", {}).get("name") or "there").split()[0]
            return (
                f"That's great, {first_name}! Here's a link to book a time that works for you: "
                f"{CALENDLY_URL}\n\nLooking forward to it!"
            )

        if intent == "objection":
            from agents.outreach.outreach_agent import OutreachAgent
            result = OutreachAgent().respond_to_objection(context, reply)
            return result.get("response_text") or result.get("body") or str(result)

        # interested, neutral, fact_question — use Claude with context-grounded system prompt
        history = self.memory.summarize_history(lead_id)
        messages = self._build_messages(history)
        system = self._system_prompt(context, intent)

        tracer = AgentTracer(agent="conversation", lead_id=lead_id, context=context, prompt_version=f"conv_{intent}_v1")
        with tracer.trace(prompt=reply, system=system) as t:
            response = client.messages.create(
                model=MODEL,
                max_tokens=512,
                system=system,
                messages=messages + [{"role": "user", "content": reply}],
            )
            response_text = response.content[0].text
            t.finish(response)
            t.set_self_eval(self_evaluate("conversation", response_text, context_to_summary(context)))
            Validator("conversation", lead_id=lead_id, context=context).validate(response_text, tracker=t)
        return response_text

    # ── Prompt construction ───────────────────────────────────────────────────

    def _system_prompt(self, context: dict, intent: str) -> str:
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

        # ── Domain A: prospect facts (THEIR org) ────────────────────────────
        prospect_block = (
            f"== PROSPECT FACTS (about THEIR organisation — {company.get('name')}) ==\n"
            f"  - Summary: {summary}\n"
            f"  - Pain points: {pain_text}\n"
            f"  - Strategic priorities: {priorities_text}\n"
            f"  - Growth stage: {growth_stage} | AI readiness: {ai_score}/10 | Scaling: {scaling}\n"
            f"  - Industry: {company.get('industry')} | Size: {company.get('employee_count')} employees\n"
        )

        # ── Domain B: sender KB (YOUR org — Ganit's verified proof points) ──
        tech_stack = company.get("technologies") or []
        vertical = context.get("_vertical") or ""
        domain = context.get("_domain") or ""
        try:
            kb_claims = _sender_kb.retrieve(
                vertical=vertical or "generic",
                domain=domain or "generic",
                technologies=tech_stack,
                n=3,
            )
            kb_text = _sender_kb.get_claims_text([r["id"] for r in kb_claims])
        except Exception:
            kb_text = "(no KB claims available)"

        sender_block = (
            f"== GANIT'S CAPABILITIES (about YOUR organisation — cite these when asked about Ganit's experience) ==\n"
            f"{_GANIT_IDENTITY}\n"
            f"Verified proof points you may cite:\n{kb_text}\n"
        )

        base = (
            f"You are an expert SDR at Ganit, conversing with {lead.get('name')}, "
            f"{lead.get('title')} at {company.get('name')}.\n\n"
            f"CRITICAL RULE: Keep these two sources completely separate.\n"
            f"  - Questions about THEIR company → use PROSPECT FACTS.\n"
            f"  - Questions about YOUR company (Ganit) → use GANIT'S CAPABILITIES only.\n"
            f"  - Never attribute Ganit's work or metrics to {company.get('name')}, "
            f"and never attribute {company.get('name')}'s data to Ganit.\n\n"
            f"{prospect_block}\n"
            f"{sender_block}"
        )

        if intent == "fact_question":
            return base + (
                "\nThe prospect asked a factual question. First decide: is this about "
                "THEIR company or about Ganit? Then answer using only the matching block above. "
                "If asked about Ganit's experience, cite the verified proof points — do not invent metrics. "
                "If you lack specific data, say so and offer to cover it on a call."
            )

        if intent == "neutral":
            return base + (
                "\nThe prospect gave a neutral acknowledgment. "
                "Respond warmly, add one genuinely relevant insight from their PROSPECT FACTS, "
                "and keep the conversation open. Do NOT push for a meeting yet."
            )

        if intent == "interested":
            return base + (
                "\nThe prospect is showing genuine interest. "
                "Acknowledge their specific situation using the PROSPECT FACTS. "
                "Reinforce relevance by citing one matching Ganit proof point from GANIT'S CAPABILITIES. "
                "Suggest a brief 15-minute call — warm and natural, not salesy."
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
                "content": "Understood. I'll respond in the context of our prior exchange.",
            },
        ]

    # ── Email reply ───────────────────────────────────────────────────────────

    def _send_email(self, lead_email: str, original_reply: str, response_text: str, context: dict) -> dict:
        from services.email_sender import EmailSender
        company_name = context.get("company", {}).get("name", "")
        email_result = EmailSender().send(
            to_email=lead_email,
            subject=f"Re: {company_name} — following up",
            body=response_text,
        )
        return {
            "email_sent": email_result.get("sent", False),
            "email_error": email_result.get("error"),
        }
