FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .
COPY sample_data/ /app/sample_data/

# Seed demo data — copied to storage on first run (volume init)
COPY backend/seed_data/ /app/backend/seed_data/
RUN mkdir -p storage/outreach_queue storage/audit_logs && \
    cp -n seed_data/outreach_queue/queue.jsonl storage/outreach_queue/queue.jsonl 2>/dev/null || true && \
    cp -n seed_data/audit_logs/*.jsonl storage/audit_logs/ 2>/dev/null || true

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]