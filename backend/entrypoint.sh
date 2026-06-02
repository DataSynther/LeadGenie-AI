#!/usr/bin/env sh
# On first boot (empty storage volume) copy seed data into the mounted volume.
# On subsequent boots the volume already has data — leave it alone.
set -e

STORAGE_DIR="/app/backend/storage"
SEED_DIR="/app/backend/seed_storage"

if [ -d "$SEED_DIR" ]; then
  for subdir in "$SEED_DIR"/*/; do
    name=$(basename "$subdir")
    target="$STORAGE_DIR/$name"
    if [ ! -d "$target" ] || [ -z "$(ls -A "$target" 2>/dev/null)" ]; then
      echo "[entrypoint] Seeding $target from seed data..."
      mkdir -p "$target"
      cp -r "$subdir"* "$target/" 2>/dev/null || true
    fi
  done
fi

exec uvicorn main:app --host 0.0.0.0 --port 8000
