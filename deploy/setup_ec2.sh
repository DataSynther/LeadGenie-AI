#!/usr/bin/env bash
# Run once on a fresh EC2 instance to configure LeadGenie + idle-shutdown.
# Assumes: Amazon Linux 2023 or Ubuntu 22.04, Docker already installed.

set -euo pipefail

APP_DIR=/opt/leadgenie
STORAGE_DIR=/app/leadgenie/storage

echo "==> Creating directories"
mkdir -p "$APP_DIR" "$STORAGE_DIR"

echo "==> Installing idle-shutdown script"
cp "$(dirname "$0")/idle_shutdown.sh" "$APP_DIR/idle_shutdown.sh"
chmod +x "$APP_DIR/idle_shutdown.sh"

echo "==> Installing systemd units"
cp "$(dirname "$0")/leadgenie-shutdown.service" /etc/systemd/system/
cp "$(dirname "$0")/leadgenie-shutdown.timer"   /etc/systemd/system/

echo "==> Enabling idle-shutdown timer"
systemctl daemon-reload
systemctl enable --now leadgenie-shutdown.timer

echo "==> Creating initial activity marker"
touch /tmp/leadgenie_last_activity

echo "Done. Idle-shutdown is active (default: 60 min)."
echo "Override by editing IDLE_MINUTES in /etc/systemd/system/leadgenie-shutdown.service"
