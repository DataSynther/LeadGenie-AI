import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv
load_dotenv()

import imaplib, email
from email.header import decode_header

user     = os.getenv("GMAIL_USER", "")
password = os.getenv("GMAIL_APP_PASSWORD", "")

mail = imaplib.IMAP4_SSL("imap.gmail.com", 993)
mail.login(user, password)
mail.select("INBOX")

print("=== Checking UNSEEN emails with 'Re:' in subject ===")
_, data = mail.search(None, 'UNSEEN SUBJECT "Re:"')
ids = data[0].split() if data[0] else []
print(f"Found: {len(ids)} unseen Re: emails\n")

print("=== Last 5 emails in inbox (any status) ===")
_, all_data = mail.search(None, "ALL")
all_ids = all_data[0].split()
for mid in all_ids[-5:]:
    _, raw = mail.fetch(mid, "(RFC822)")
    msg = email.message_from_bytes(raw[0][1])
    subject_raw = msg.get("Subject", "")
    from_raw    = msg.get("From", "")
    parts = decode_header(subject_raw)
    subject = "".join(p.decode(e or "utf-8") if isinstance(p, bytes) else p for p, e in parts)
    print(f"  From   : {from_raw}")
    print(f"  Subject: {subject}")
    print()

print(f"=== REPLY_TO_EMAIL in .env: '{os.getenv('REPLY_TO_EMAIL', 'NOT SET')}' ===")
mail.logout()
