#!/bin/bash
# On first EFS mount, storage/ is empty — seed it from storage_init/ (no-clobber).
# On subsequent starts the files already exist on EFS, so cp -n is a no-op.
if [ -d /app/backend/storage_init ]; then
    cp -rn /app/backend/storage_init/. /app/backend/storage/ 2>/dev/null || true
fi
exec "$@"
