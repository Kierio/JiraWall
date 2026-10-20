#!/usr/bin/env bash
# Updates an existing installation to the latest code and sets up anything new
# (currently: HDMI-CEC for the TV power schedule). Run on the Pi as your normal
# desktop user:
#   cd ~/JiraStats && bash deploy/update.sh
# Extra options are passed to deploy/setup-cec.sh (e.g. --no-force-hdmi).
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

if [ "$(id -u)" = "0" ]; then
  echo "Run this as your normal desktop user, not root (it uses sudo where needed)."
  exit 1
fi

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

if [ -d .git ]; then
  step "Pulling the latest code"
  git pull --ff-only
else
  echo "Not a git checkout; using the files already here (copy the new version over first)."
fi

step "Installing dependencies and building"
npm ci
npm run build

chmod +x deploy/*.sh 2>/dev/null || true

# HDMI-CEC for the TV schedule (idempotent; skips what's already done).
bash "$DIR/deploy/setup-cec.sh" "$@"

step "Restarting the dashboard"
sudo systemctl restart jira-dash
bash "$DIR/deploy/restart-kiosk.sh" || true

echo
echo "Updated. If setup-cec.sh asked for a reboot above, run: sudo reboot"
