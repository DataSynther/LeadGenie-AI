import json
import os
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
from twilio.rest import Client

app = FastAPI(title="LeadGenie WhatsApp Mailbox", version="0.3.0")

STORE_DIR = Path(os.getenv("WHATSAPP_MAILBOX_DIR", "/tmp/leadgenie_whatsapp_mailbox")).resolve()
PENDING_PATH = STORE_DIR / "pending_messages.json"


class SendWhatsAppRequest(BaseModel):
    phone: str
    message: str


@app.get("/")
async def home():
    return {
        "status": "ok",
        "service": "LeadGenie WhatsApp mailbox",
        "version": app.version,
        "store_dir": str(STORE_DIR),
    }


@app.post("/send-whatsapp")
async def send_whatsapp(req: SendWhatsAppRequest):
    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    from_number = os.getenv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")

    if not account_sid or not auth_token:
        raise HTTPException(status_code=500, detail="Twilio credentials are not configured")

    to_number = _normalize_whatsapp_number(req.phone)
    client = Client(account_sid, auth_token)
    message = client.messages.create(
        from_=from_number,
        to=to_number,
        body=req.message,
    )
    return {"sent": True, "sid": message.sid, "to": to_number}


@app.post("/whatsapp")
async def whatsapp_webhook(request: Request):
    payload = await _read_payload(request)
    sender = (
        payload.get("From")
        or payload.get("from")
        or payload.get("phone")
        or payload.get("sender")
        or ""
    ).strip()
    body = (
        payload.get("Body")
        or payload.get("body")
        or payload.get("message")
        or ""
    ).strip()

    if not sender or not body:
        return {
            "stored": False,
            "reason": "missing sender or body",
            "sender_present": bool(sender),
            "body_present": bool(body),
            "payload_keys": sorted(payload.keys()),
            "pending_count": len(_read_pending()),
            "store_dir": str(STORE_DIR),
        }

    message = {
        "id": uuid4().hex,
        "from": sender,
        "body": body,
        "received_at": datetime.utcnow().isoformat(),
    }
    pending = _read_pending()
    pending.append(message)
    _write_pending(pending)
    return {
        "stored": True,
        "pending_count": len(pending),
        "message": message,
        "store_dir": str(STORE_DIR),
    }


@app.get("/pending-messages")
async def pending_messages():
    messages = _read_pending()
    return {
        "messages": messages,
        "count": len(messages),
        "store_dir": str(STORE_DIR),
        "store_file": str(PENDING_PATH),
    }


async def _read_payload(request: Request) -> dict:
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        return await request.json()
    form = await request.form()
    return dict(form)


def _read_pending() -> list[dict]:
    STORE_DIR.mkdir(parents=True, exist_ok=True)
    if not PENDING_PATH.exists():
        return []
    with open(PENDING_PATH, encoding="utf-8") as f:
        if PENDING_PATH.stat().st_size == 0:
            return []
        return json.load(f)


def _write_pending(messages: list[dict]) -> None:
    STORE_DIR.mkdir(parents=True, exist_ok=True)
    tmp_path = PENDING_PATH.with_suffix(f".{uuid4().hex}.tmp")
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(messages, f, indent=2)
    tmp_path.replace(PENDING_PATH)


def _normalize_whatsapp_number(phone: str) -> str:
    normalized = (phone or "").replace(" ", "").strip()
    if normalized.lower().startswith("whatsapp:"):
        return normalized
    return f"whatsapp:{normalized}"
