"""Starts the Gmail reply poller. Keep this running alongside the backend."""
import sys, os
_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(_root, "backend"))
sys.path.insert(0, _root)

from dotenv import load_dotenv
load_dotenv()

import logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

from services.gmail_reply_poller import GmailReplyPoller

print("LeadGenie — Gmail Reply Poller")
print("Watching vickyiter@gmail.com for lead replies every 60s")
print("Press Ctrl+C to stop\n")

GmailReplyPoller().run_forever()
