"""Directly processes the reply from vickyiter@gmail.com — bypasses the 678-email queue."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv
load_dotenv()

from services.gmail_reply_poller import GmailReplyPoller

print("Processing replies from known leads now...\n")
results = GmailReplyPoller().process_once()

if not results:
    print("No matching replies found — either already processed or not from a known lead.")
else:
    for r in results:
        print(f"Lead    : {r['lead_email']}")
        print(f"Intent  : {r['intent']} (confidence={r.get('intent_confidence', 0):.2f})")
        print(f"Replied : {r['response_sent']}")
