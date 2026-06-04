import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from services import whatsapp_conversation_store as store_module
from services.whatsapp_conversation_store import WhatsAppConversationStore


def test_whatsapp_threads_are_keyed_by_sender_phone(tmp_path, monkeypatch):
    monkeypatch.setattr(store_module, "STORE_DIR", tmp_path)

    store = WhatsAppConversationStore()
    context = {
        "lead": {
            "name": "Melvin Salvius",
            "phone": "+91 9489616230",
        },
        "company": {
            "name": "Britannia Industries Limited",
        },
    }

    user_a = "whatsapp:+919489616230"
    user_b = "whatsapp:+918056498879"
    shared_lead_id = "696cb6c2d4cef40001c3cd64"

    a_first = store.add_message(shared_lead_id, context, "inbound", "Hi from A", phone=user_a)
    b_first = store.add_message(shared_lead_id, context, "inbound", "Hi from B", phone=user_b)
    a_second = store.add_message(shared_lead_id, context, "inbound", "A again", phone=user_a)

    a_conversation_id = store._summary(a_first)["conversation_id"]
    b_conversation_id = store._summary(b_first)["conversation_id"]

    assert a_conversation_id != b_conversation_id
    assert store._summary(a_second)["conversation_id"] == a_conversation_id

    a_thread = store.get(a_conversation_id)
    b_thread = store.get(b_conversation_id)

    assert [message["message"] for message in a_thread["messages"]] == ["Hi from A", "A again"]
    assert [message["message"] for message in b_thread["messages"]] == ["Hi from B"]

    conversations = store.list_active()
    assert {conversation["phone"] for conversation in conversations} == {user_a, user_b}
    assert len(conversations) == 2


def test_whatsapp_thread_stays_visible_after_admin_reply(tmp_path, monkeypatch):
    monkeypatch.setattr(store_module, "STORE_DIR", tmp_path)

    store = WhatsAppConversationStore()
    context = {
        "lead": {
            "name": "Melvin Salvius",
            "phone": "+91 9489616230",
        },
        "company": {
            "name": "Britannia Industries Limited",
        },
    }
    phone = "whatsapp:+919489616230"
    lead_id = "696cb6c2d4cef40001c3cd64"

    inbound = store.add_message(lead_id, context, "inbound", "Can we connect?", phone=phone)
    conversation_id = store._summary(inbound)["conversation_id"]

    assert [conversation["conversation_id"] for conversation in store.list_active()] == [conversation_id]
    assert store.list_active()[0]["status"] == "awaiting_human"

    outbound = store.add_message(lead_id, context, "outbound", "Sure, what time works?", phone=phone)
    active = store.list_active()

    assert len(active) == 1
    assert active[0]["conversation_id"] == conversation_id
    assert active[0]["status"] == "human_responded"
    assert [message["message"] for message in store._summary(outbound)["messages"]] == [
        "Can we connect?",
        "Sure, what time works?",
    ]
