import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

import json
from services.apollo.apollo_signals import ApolloSignalsService
from agents.research.research_agent import ResearchAgent
from agents.research.context_builder import ContextBuilder
from agents.conversation.conversation_agent import ConversationAgent
from agents.conversation.memory_manager import MemoryManager
from agents.conversation.intent_detector import IntentDetector

with open("sample_data/demo_leads.json") as f:
    leads = json.load(f)
with open("sample_data/demo_companies.json") as f:
    companies = json.load(f)

company_map = {c["name"]: c for c in companies}

# Use first lead to build a real context
lead = leads[0]
company = company_map.get(lead["company"], companies[0])
signals = ApolloSignalsService().detect_hiring_trends(company.get("id"), company)
research = ResearchAgent().research_company(company, signals)
context = ContextBuilder().build_lead_context(lead, company, signals, research)

PASS = 0
FAIL = 0

print("=" * 70)
print("CONVERSATION AGENT — INTENT DETECTION & MULTI-TURN TEST")
print("=" * 70)
print(f"\nLead    : {lead['name']} | {lead['title']}")
print(f"Company : {company['name']} | {company['industry']}")
print(f"Context : growth_stage={research.get('growth_stage')} | ai_score={research.get('ai_readiness_score')}/10")

# ── Reset memory between test groups ─────────────────────────────────────────

def reset_memory():
    MemoryManager().clear(lead["id"])

# ── Helper ────────────────────────────────────────────────────────────────────

def run_test(label: str, reply: str, expected_intent, send_email: bool = False):
    """expected_intent can be a str or a list of acceptable intents (for mixed-signal replies)."""
    global PASS, FAIL
    conv = ConversationAgent()
    email_arg = lead["email"] if send_email else None
    valid_intents = [expected_intent] if isinstance(expected_intent, str) else expected_intent
    print(f"\n  [{label}]")
    print(f"  Lead says : \"{reply[:100]}{'...' if len(reply) > 100 else ''}\"")
    try:
        result = conv.handle_reply(lead["id"], reply, context, lead_email=email_arg)
        intent = result.get("intent")
        confidence = result.get("intent_confidence", 0)
        signal = result.get("intent_signal", "")
        reasoning = result.get("intent_reasoning", "")
        response = result.get("response", "")
        turns = result.get("conversation_length", 0)

        print(f"  Intent    : {intent} (confidence={confidence:.2f}, signal='{signal}')")
        print(f"  Reasoning : {reasoning}")
        print(f"  Response  :\n    {response[:350].replace(chr(10), chr(10) + '    ')}")
        print(f"  Memory    : {turns} turns stored")
        if send_email:
            status = "sent" if result.get("email_sent") else f"failed ({result.get('email_error')})"
            print(f"  Email     : {status}")

        errors = []
        if not response:
            errors.append("empty response")
        if not intent:
            errors.append("missing intent")
        if intent not in valid_intents:
            errors.append(f"expected intent in {valid_intents}, got='{intent}'")
        if turns == 0:
            errors.append("memory not persisted")

        if errors:
            print(f"  RESULT    : FAIL — {errors}")
            FAIL += 1
        else:
            print(f"  RESULT    : PASS")
            PASS += 1

    except Exception as e:
        print(f"  RESULT    : FAIL — {e}")
        FAIL += 1

# ═══════════════════════════════════════════════════════════════════════════════
# GROUP 1 — Intent classification accuracy
# ═══════════════════════════════════════════════════════════════════════════════

print("\n\n── GROUP 1: Intent Detection ─────────────────────────────────────────")

reset_memory()
run_test(
    "INTERESTED",
    "Thanks for the email! This is actually very relevant for us — we've been struggling with exactly the supply chain visibility problem you mentioned. Can you share more?",
    expected_intent="interested",
)

reset_memory()
run_test(
    "OBJECTION – has vendor",
    "We already have a vendor for this and we just renewed our contract last quarter. Not looking to switch.",
    expected_intent="objection",
)

reset_memory()
run_test(
    "FACT QUESTION",
    "What kind of ROI have companies in the FMCG sector typically seen with this solution?",
    expected_intent="fact_question",
)

reset_memory()
run_test(
    "NEUTRAL",
    "Thanks for reaching out. I'll take a look.",
    expected_intent="neutral",
)

reset_memory()
run_test(
    "MEETING REQUEST",
    "Sure, let's set up a call. Send me a calendar invite.",
    expected_intent="meeting_request",
)

reset_memory()
run_test(
    "UNSUBSCRIBE",
    "Please remove me from your list. Not interested.",
    expected_intent="unsubscribe",
)

# ═══════════════════════════════════════════════════════════════════════════════
# GROUP 2 — Context-grounded fact answering
# ═══════════════════════════════════════════════════════════════════════════════

print("\n\n── GROUP 2: Context-Grounded Responses ──────────────────────────────")

reset_memory()
run_test(
    "FACT – industry-specific",
    f"How exactly would this help a company in the {company['industry']} space like us?",
    expected_intent="fact_question",
)

reset_memory()
run_test(
    "NEUTRAL – follow-up insight",
    "Ok, noted.",
    expected_intent="neutral",
)

# ═══════════════════════════════════════════════════════════════════════════════
# GROUP 3 — Multi-turn memory persistence
# ═══════════════════════════════════════════════════════════════════════════════

print("\n\n── GROUP 3: Multi-Turn Memory ────────────────────────────────────────")

reset_memory()
conv = ConversationAgent()

print("\n  Simulating a 3-turn conversation...")
turns_data = [
    ("Thanks — this sounds interesting. Tell me more.", "interested"),
    ("What's the implementation timeline typically?", "fact_question"),
    ("Ok. Let's find a time to chat.", "meeting_request"),
]

prev_turns = 0
all_pass = True
for i, (reply_text, exp_intent) in enumerate(turns_data, 1):
    print(f"\n  Turn {i}: \"{reply_text}\"")
    try:
        result = conv.handle_reply(lead["id"], reply_text, context)
        turns = result.get("conversation_length", 0)
        intent = result.get("intent")
        print(f"    Intent   : {intent} | Turns: {turns}")
        print(f"    Response : {result.get('response', '')[:200]}...")
        if turns <= prev_turns:
            print(f"    WARN: turn count did not increase ({prev_turns} → {turns})")
            all_pass = False
        prev_turns = turns
    except Exception as e:
        print(f"    ERROR: {e}")
        all_pass = False

if all_pass:
    print(f"\n  RESULT: PASS — memory grew across {prev_turns} turns")
    PASS += 1
else:
    print(f"\n  RESULT: FAIL — memory or turn count issue")
    FAIL += 1

# ═══════════════════════════════════════════════════════════════════════════════
# GROUP 4 — Email send-back on reply
# ═══════════════════════════════════════════════════════════════════════════════

print("\n\n── GROUP 4: Email Send-Back ──────────────────────────────────────────")

reset_memory()
run_test(
    "INTERESTED + send email",
    "This looks very promising. Can you share a case study?",
    expected_intent=["interested", "fact_question"],  # mixed signal: interest + evidence request
    send_email=True,
)

# ═══════════════════════════════════════════════════════════════════════════════
# Intent Analytics Summary
# ═══════════════════════════════════════════════════════════════════════════════

print("\n\n── Intent Analytics (cumulative across all test runs) ────────────────")
analytics = IntentDetector.get_summary()
print(f"\n  Total events logged : {analytics['total_events']}")
for intent_name, stats in sorted(analytics["by_intent"].items(), key=lambda x: -x[1]["count"]):
    print(f"  {intent_name:<16} : {stats['count']} events | avg confidence {stats['avg_confidence']:.3f} | top signals: {stats['top_signals']}")

# ─────────────────────────────────────────────────────────────────────────────

print(f"\n{'=' * 70}")
print(f"SUMMARY: {PASS} passed / {FAIL} failed / {PASS + FAIL} total")
print("=" * 70)
