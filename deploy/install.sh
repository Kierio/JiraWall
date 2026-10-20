#!/usr/bin/env bash
# One-time setup on a Raspberry Pi 5 running 64-bit Raspberry Pi OS (Desktop).
# Run it from the project folder as your normal desktop user (not root):
#   cd ~/JiraStats && bash deploy/install.sh
# It installs the dashboard server as a service, then runs deploy/setup-kiosk.sh so
# the two screens open full screen at boot. Kiosk options pass straight through, e.g.:
#   bash deploy/install.sh --wayland --swap
# It is safe to run again after pulling updates (or use deploy/update.sh).
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
USER_NAME="$(id -un)"
cd "$DIR"

if [ "$(id -u)" = "0" ]; then
  echo "Run this as your normal desktop user, not root (it uses sudo where needed)."
  exit 1
fi

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

step "Installing curl"
sudo apt-get update
sudo apt-get install -y curl

step "Checking Node.js (22 LTS or newer required)"
NODE_MAJOR=0
if command -v node >/dev/null; then NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"; fi
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Installing Node.js 22 from NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "node $(node -v), npm $(npm -v)"

step "Installing dependencies and building"
npm ci
npm run build

step "Creating .env"
if [ ! -f .env ]; then
  cp .env.example .env
  chmod 600 .env
  echo "Created .env from .env.example. EDIT IT before the dashboard can reach Jira:"
  echo "   nano $DIR/.env"
else
  chmod 600 .env
  echo ".env already exists; leaving it alone."
fi

step "Installing the systemd service (jira-dash)"
sed -e "s|__USER__|$USER_NAME|g" -e "s|__DIR__|$DIR|g" -e "s|__NODE__|$(command -v node)|g" deploy/jira-dash.service |
  sudo tee /etc/systemd/system/jira-dash.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable jira-dash
sudo systemctl restart jira-dash

# Chromium, emoji font, raspi-config (auto-login, no blanking, session) and autostart.
bash "$DIR/deploy/setup-kiosk.sh" "$@"

# cec-ctl for the TV on/off schedule (Settings > TV power on the admin page).
bash "$DIR/deploy/setup-cec.sh" || echo "HDMI-CEC setup had problems; re-run bash deploy/setup-cec.sh later."

IP="$(hostname -I | awk '{print $1}')"
cat <<MSG

Server status:   systemctl status jira-dash   (logs: journalctl -u jira-dash -f)
Admin page:      http://$IP:3000/admin   (open from your laptop)
Screens:         http://$IP:3000/screen/1 and /screen/2

Still to do (once): edit $DIR/.env with your Jira URL, email, API token and an
admin password, run "sudo systemctl restart jira-dash", then reboot.
MSG
