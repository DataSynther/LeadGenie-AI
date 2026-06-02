FROM python:3.11-slim

WORKDIR /app/backend

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .
COPY sample_data/ /app/sample_data/

# Bake storage data as seed — entrypoint copies it to the volume on first boot
RUN cp -r /app/backend/storage /app/backend/seed_storage && \
    chmod +x /app/backend/entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/app/backend/entrypoint.sh"]