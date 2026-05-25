import os
import requests
from datetime import datetime

CALENDLY_TOKEN = os.getenv("CALENDLY_API_TOKEN")
CALENDLY_BASE_URL = "https://api.calendly.com"


class Scheduler:
    """Handles meeting slot suggestions and Calendly booking integration."""

    def __init__(self):
        self.headers = {
            "Authorization": f"Bearer {CALENDLY_TOKEN}",
            "Content-Type": "application/json",
        }

    def get_event_types(self) -> list[dict]:
        """Return available event types from Calendly."""
        response = requests.get(
            f"{CALENDLY_BASE_URL}/event_types",
            headers=self.headers,
            params={"organization": os.getenv("CALENDLY_ORG_URI")},
        )
        response.raise_for_status()
        return response.json().get("collection", [])

    def generate_scheduling_link(self, event_type_uri: str) -> str:
        """Return a one-time scheduling link for a given event type."""
        response = requests.post(
            f"{CALENDLY_BASE_URL}/scheduling_links",
            headers=self.headers,
            json={"max_event_count": 1, "owner": event_type_uri, "owner_type": "EventType"},
        )
        response.raise_for_status()
        return response.json()["resource"]["booking_url"]

    def suggest_meeting_copy(self, lead_name: str, scheduling_link: str) -> str:
        """Return a CTA sentence with the scheduling link to embed in outreach."""
        return (
            f"Would you be open to a quick 20-minute call, {lead_name}? "
            f"You can grab time directly here: {scheduling_link}"
        )

    def confirm_meeting(self, event_uri: str) -> dict:
        """Fetch details of a confirmed meeting event."""
        response = requests.get(
            f"{CALENDLY_BASE_URL}/scheduled_events/{event_uri}",
            headers=self.headers,
        )
        response.raise_for_status()
        event = response.json()["resource"]
        return {
            "name": event.get("name"),
            "start_time": event.get("start_time"),
            "end_time": event.get("end_time"),
            "status": event.get("status"),
        }
