"""Quick test — verifies Gmail IMAP connection using app password."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

import imaplib

user     = os.getenv("GMAIL_USER", "")
password = os.getenv("GMAIL_APP_PASSWORD", "")

if not user or not password:
    print("FAIL — GMAIL_USER or GMAIL_APP_PASSWORD not set in .env")
    sys.exit(1)

print(f"Connecting to imap.gmail.com as {user} ...")
try:
    mail = imaplib.IMAP4_SSL("imap.gmail.com", 993)
    mail.login(user, password)
    print("  Login        : OK")

    mail.select("INBOX")
    status, data = mail.search(None, "ALL")
    count = len(data[0].split()) if data[0] else 0
    print(f"  Inbox messages: {count}")

    mail.logout()
    print("\nRESULT: PASS — Gmail IMAP is working")
except imaplib.IMAP4.error as e:
    print(f"\nRESULT: FAIL — {e}")
    print("Check: app password correct? IMAP enabled in Gmail settings?")
