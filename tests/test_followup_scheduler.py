import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from scheduling import followup_scheduler as scheduler_module
from scheduling.followup_scheduler import FollowupScheduler


class FakeTwilioWhatsApp:
    sent_messages = []

    def send(self, phone, message):
        self.sent_messages.append({"phone": phone, "message": message})
        return {
            "sent": True,
            "status_code": 200,
            "elapsed_seconds": 0,
            "normalized_to": phone,
            "error": None,
        }


class FakeMemoryManager:
    def store_message(self, *args, **kwargs):
        return None


class FakeWhatsAppConversationStore:
    def add_message(self, *args, **kwargs):
        return {}


class FakeOutreachQueueStore:
    queued = []

    def enqueue(self, **kwargs):
        event_id = f"evt_{len(self.queued) + 1}"
        self.queued.append({**kwargs, "event_id": event_id})
        return event_id


def _context():
    return {
        "lead": {
            "id": "lead_1",
            "name": "Maria Chen",
            "title": "Chief Product Officer",
            "email": "maria@example.com",
            "phone": "+15551234567",
        },
        "company": {
            "name": "HubSpot",
            "industry": "marketing technology",
        },
        "outreach": {
            "subject": "HubSpot analytics roadmap",
            "body": "Initial outreach body",
        },
    }


def test_email_followups_do_not_schedule_additional_whatsapp(tmp_path, monkeypatch):
    monkeypatch.setattr(scheduler_module, "STORE_DIR", tmp_path)
    monkeypatch.setattr(scheduler_module, "TwilioWhatsApp", FakeTwilioWhatsApp)
    monkeypatch.setattr(scheduler_module, "MemoryManager", FakeMemoryManager)
    monkeypatch.setattr(scheduler_module, "WhatsAppConversationStore", FakeWhatsAppConversationStore)
    monkeypatch.setattr(scheduler_module, "OutreachQueueStore", FakeOutreachQueueStore)
    monkeypatch.setenv("EMAIL_FOLLOWUP_WAIT_MINUTES", "0")
    monkeypatch.setattr(FollowupScheduler, "_build_message", lambda self, record: "WhatsApp follow-up")
    monkeypatch.setattr(
        FollowupScheduler,
        "_validate_email",
        lambda self, lead_id, email, context: ({"approved": True}, []),
    )
    FakeTwilioWhatsApp.sent_messages = []
    FakeOutreachQueueStore.queued = []

    scheduler = FollowupScheduler()
    lead_id = "lead_1"
    scheduler.schedule_followup(
        lead_id=lead_id,
        phone="+15551234567",
        context=_context(),
        outreach={"subject": "HubSpot analytics roadmap", "body": "Initial outreach body"},
        wait_minutes=-1,
        max_followups=5,
    )

    first_result = scheduler.process_due()
    assert first_result[0]["sent"] is True
    assert len(FakeTwilioWhatsApp.sent_messages) == 1
    assert [item["followup_number"] for item in FakeOutreachQueueStore.queued] == [2]

    for followup_number in (2, 3, 4):
        record = scheduler.get(lead_id)
        event_id = record["pending_followup_event_id"]
        scheduler.mark_followup_sent(
            lead_id,
            event_id,
            followup_number,
            {"subject": f"Re: HubSpot analytics roadmap #{followup_number}", "body": "Sent"},
        )
        scheduler.process_due()

    record = scheduler.get(lead_id)
    event_id = record["pending_followup_event_id"]
    scheduler.mark_followup_sent(
        lead_id,
        event_id,
        5,
        {"subject": "Re: HubSpot analytics roadmap #5", "body": "Sent"},
    )

    final_record = scheduler.get(lead_id)
    assert len(FakeTwilioWhatsApp.sent_messages) == 1
    assert [item["followup_number"] for item in FakeOutreachQueueStore.queued] == [2, 3, 4, 5]
    assert final_record["status"] == "completed"
    assert final_record["next_followup_number"] is None


def test_followup_three_and_four_use_configured_templates():
    scheduler = FollowupScheduler()
    record = {
        "context": _context(),
        "outreach": {"subject": "HubSpot analytics roadmap", "body": "Initial outreach body"},
    }

    followup_3 = scheduler._build_email_followup(record, 3)
    followup_4 = scheduler._build_email_followup(record, 4)

    assert "Just checking back on my previous emails." in followup_3["body"]
    assert "15-20 minute conversation" in followup_3["body"]
    assert "Would you be open to connecting sometime this week?" in followup_3["body"]
    assert followup_3["body"].endswith("Regards,\nGanit Team")

    assert "one final follow-up" in followup_4["body"]
    assert "If this is not a priority right now, no worries at all." in followup_4["body"]
    assert "someone else on your team who would be the right person" in followup_4["body"]
    assert followup_4["body"].endswith("Regards,\nGanit Team")
