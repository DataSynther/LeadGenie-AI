FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .
COPY sample_data/ /app/sample_data/

# Seed demo data into storage/
COPY backend/seed_data/ /app/backend/seed_data/
RUN mkdir -p storage/outreach_queue storage/audit_logs storage/intent_analytics storage/diagnostics && \
    cp -n seed_data/outreach_queue/queue.jsonl storage/outreach_queue/queue.jsonl 2>/dev/null || true && \
    cp -n seed_data/audit_logs/*.jsonl storage/audit_logs/ 2>/dev/null || true && \
    cp -n seed_data/intent_analytics_events.jsonl storage/intent_analytics/events.jsonl 2>/dev/null || true && \
    cp -n seed_data/diagnostics_traces.jsonl storage/diagnostics/traces.jsonl 2>/dev/null || true

# Stage all of storage/ so the EFS entrypoint can seed on first mount
# (EFS shadows storage/ at runtime, so we can't rely on the image layer)
RUN cp -r storage storage_init

COPY backend/entrypoint.sh /app/backend/entrypoint.sh
RUN chmod +x /app/backend/entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/app/backend/entrypoint.sh"]
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]