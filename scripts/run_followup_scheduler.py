"""Runs due WhatsApp follow-ups. Keep this running alongside the backend."""
import logging
import os
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))

from dotenv import load_dotenv

load_dotenv()

from scheduling.followup_scheduler import FollowupScheduler

interval = int(os.getenv("FOLLOWUP_SCHEDULER_INTERVAL_SECONDS", "15"))
logging.basicConfig(
    level=os.getenv("FOLLOWUP_SCHEDULER_LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s - %(message)s",
)
scheduler = FollowupScheduler()

print("LeadGenie - WhatsApp Follow-up Scheduler")
print(f"Checking due follow-ups every {interval}s")
print("Press Ctrl+C to stop\n")

while True:
    results = scheduler.process_due()
    now = datetime.now(timezone.utc).strftime("%H:%M:%S")
    if results:
        for result in results:
            print(
                f"[{now}] lead_id={result['lead_id']} "
                f"whatsapp_sent={result.get('sent')} "
                f"status_code={result.get('status_code')} "
                f"elapsed={result.get('elapsed_seconds')} "
                f"to={result.get('normalized_to') or result.get('to')} "
                f"error={result.get('error')}"
            )
    else:
        print(f"[{now}] No due follow-ups")
    time.sleep(interval)
