"""LeadGenie Worker — SQS consumer for async agent jobs.

AWS mode : polls SQS_QUEUE_URL, processes agent job messages.
Local mode: SQS_QUEUE_URL unset → polls the file-based outreach queue,
            useful for Docker smoke-tests without AWS credentials.
"""
from __future__ import annotations

import json
import logging
import os
import sys
import time
from pathlib import Path

# Load .env when running locally (Docker passes env vars directly)
try:
    from dotenv import load_dotenv
    load_dotenv(dotenv_path=Path(__file__).parent.parent.parent / ".env")
except ImportError:
    pass

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [worker] %(levelname)s %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger(__name__)

QUEUE_URL = os.environ.get("SQS_QUEUE_URL", "")
POLL_INTERVAL = int(os.environ.get("WORKER_POLL_SECONDS", "10"))


# ── AWS SQS mode ──────────────────────────────────────────────────────────────

def _process_sqs_message(body: dict) -> None:
    job_type = body.get("job_type", "unknown")
    log.info("Processing SQS job: %s  payload=%s", job_type, list(body.keys()))
    # Future: dispatch to agent pipeline based on job_type
    # e.g. "outreach_batch" → run OutreachAgent for a list of leads


def _sqs_loop() -> None:
    import boto3  # type: ignore
    sqs = boto3.client("sqs", region_name=os.environ.get("AWS_REGION", "us-east-1"))
    log.info("Worker started in SQS mode — queue: %s", QUEUE_URL)

    while True:
        try:
            resp = sqs.receive_message(
                QueueUrl=QUEUE_URL,
                MaxNumberOfMessages=5,
                WaitTimeSeconds=20,      # long-poll to reduce cost
                VisibilityTimeout=900,   # 15 min — matches CDK setting
            )
            messages = resp.get("Messages", [])
            if not messages:
                continue

            for msg in messages:
                try:
                    body = json.loads(msg["Body"])
                    _process_sqs_message(body)
                    sqs.delete_message(
                        QueueUrl=QUEUE_URL,
                        ReceiptHandle=msg["ReceiptHandle"],
                    )
                    log.info("Message processed and deleted.")
                except Exception:
                    log.exception("Failed to process message — will retry after visibility timeout")

        except KeyboardInterrupt:
            log.info("Shutdown requested — exiting.")
            break
        except Exception:
            log.exception("SQS receive error — sleeping %ds before retry", POLL_INTERVAL)
            time.sleep(POLL_INTERVAL)


# ── Local / file-based mode ───────────────────────────────────────────────────

def _local_loop() -> None:
    """Poll the file-based outreach queue for pending items (local dev / Docker smoke-test)."""
    queue_file = Path(__file__).parent.parent / "storage" / "outreach_queue" / "queue.jsonl"
    log.info("Worker started in LOCAL mode (no SQS_QUEUE_URL). Watching: %s", queue_file)
    log.info("Poll interval: %ds", POLL_INTERVAL)

    while True:
        try:
            if queue_file.exists():
                lines = queue_file.read_text().strip().splitlines()
                pending = [json.loads(l) for l in lines if l and json.loads(l).get("status") == "pending"]
                if pending:
                    log.info("Local queue: %d pending item(s) waiting for approval", len(pending))
                else:
                    log.info("Local queue: idle (0 pending items)")
            else:
                log.info("Local queue: queue file not yet created")

        except Exception:
            log.exception("Local queue read error")

        time.sleep(POLL_INTERVAL)


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    log.info("LeadGenie Worker initialising…")
    if QUEUE_URL:
        _sqs_loop()
    else:
        _local_loop()
