#!/usr/bin/env bash
# Shuts down the EC2 instance if LeadGenie has had no API activity for IDLE_MINUTES.
# Run by a systemd timer (leadgenie-shutdown.timer) every minute.

set -euo pipefail

IDLE_MINUTES=${IDLE_MINUTES:-60}        # default: shutdown after 1 hour idle
ACTIVITY_FILE=${ACTIVITY_FILE:-/tmp/leadgenie_last_activity}
LOG_TAG="leadgenie-idle-shutdown"

# Create marker on first run so the instance doesn't shut down before traffic arrives
if [[ ! -f "$ACTIVITY_FILE" ]]; then
    touch "$ACTIVITY_FILE"
    logger -t "$LOG_TAG" "Initialized activity marker."
    exit 0
fi

last_activity=$(stat -c %Y "$ACTIVITY_FILE" 2>/dev/null || stat -f %m "$ACTIVITY_FILE")
now=$(date +%s)
idle_seconds=$(( now - last_activity ))
idle_minutes=$(( idle_seconds / 60 ))

logger -t "$LOG_TAG" "Idle for ${idle_minutes}m (threshold: ${IDLE_MINUTES}m)."

if (( idle_minutes >= IDLE_MINUTES )); then
    logger -t "$LOG_TAG" "Idle threshold reached. Initiating shutdown."
    shutdown -h now "LeadGenie idle shutdown (${idle_minutes}m idle)"
fi
