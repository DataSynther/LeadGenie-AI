"""Starts the Gmail reply poller. Keep this running alongside the backend."""
import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

from services.gmail_reply_poller import GmailReplyPoller

print("LeadGenie - Gmail Reply Poller")
print(f"Watching {os.getenv('LEADGENIE_GMAIL', '(missing LEADGENIE_GMAIL)')} for lead replies")
print("Press Ctrl+C to stop\n")

GmailReplyPoller().run_forever()
