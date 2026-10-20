#!/usr/bin/env bash
# Sets the Pi up to switch the HDMI TVs on and off over HDMI-CEC (cec-ctl), so the
# schedule on the admin page (Settings > TV power) can drive them.
#
# Run on the Pi as your normal desktop user (not root). Safe to run again.
#   bash deploy/setup-cec.sh              # install + configure
#   bash deploy/setup-cec.sh --test       # ...then turn the TVs off and back on
#
# Options:
#   --test            turn the TVs off, wait, and turn them on again
#   --no-force-hdmi   don't pin the HDMI outputs on in /boot/firmware/cmdline.txt
#
# Pinning the outputs (the default) keeps both HDMI ports enabled while the TVs are
# in standby. Without it some TVs drop the HDMI connection when they sleep, the
# desktop rearranges itself, and the screens can come back on the wrong monitor.
# The TVs also need CEC turned on in their own menus (Anynet+, Bravia Sync,
# SimpLink, EasyLink…).
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST=0
FORCE_HDMI=1

while [ $# -gt 0 ]; do
  case "$1" in
    --test) TEST=1 ;;
    --no-force-hdmi) FORCE_HDMI=0 ;;
    -h | --help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
  shift
done

if [ "$(id -u)" = "0" ]; then
  echo "Run this as your normal desktop user, not root (it uses sudo where needed)."
  exit 1
fi

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33mWARNING:\033[0m %s\n' "$*"; }
USER_NAME="$(id -un)"
NEEDS_REBOOT=0

step "Installing cec-ctl (v4l-utils)"
if command -v cec-ctl >/dev/null; then
  echo "cec-ctl already installed."
else
  sudo apt-get update
  sudo apt-get install -y v4l-utils
fi

step "Giving $USER_NAME access to the CEC adapters (video group)"
if id -nG "$USER_NAME" | tr ' ' '\n' | grep -qx video; then
  echo "$USER_NAME is already in the video group."
else
  sudo usermod -aG video "$USER_NAME"
  echo "Added $USER_NAME to the video group."
  NEEDS_REBOOT=1
fi

if [ "$FORCE_HDMI" = 1 ]; then
  step "Keeping both HDMI outputs on while the TVs sleep"
  CMDLINE=/boot/firmware/cmdline.txt
  [ -f "$CMDLINE" ] || CMDLINE=/boot/cmdline.txt
  CONF="$HOME/.config/jira-dash/kiosk.conf"
  W=1920
  H=1080
  if [ -f "$CONF" ]; then
    # shellcheck source=/dev/null
    W="$(. "$CONF"; echo "${SCREEN_WIDTH:-1920}")"
    # shellcheck source=/dev/null
    H="$(. "$CONF"; echo "${SCREEN_HEIGHT:-1080}")"
  fi
  if [ ! -f "$CMDLINE" ]; then
    warn "no cmdline.txt found; skipping."
  elif grep -q 'video=HDMI-A-1' "$CMDLINE"; then
    echo "$CMDLINE already sets the HDMI outputs; leaving it alone."
  else
    sudo cp "$CMDLINE" "$CMDLINE.jira-dash.bak"
    # cmdline.txt must stay a single line.
    sudo sed -i "1 s|\$| video=HDMI-A-1:${W}x${H}@60D video=HDMI-A-2:${W}x${H}@60D|" "$CMDLINE"
    echo "Added video=HDMI-A-1/2:${W}x${H}@60D to $CMDLINE (backup: $CMDLINE.jira-dash.bak)."
    NEEDS_REBOOT=1
  fi
fi

step "Checking the CEC adapters"
shopt -s nullglob
DEVICES=(/dev/cec*)
if [ "${#DEVICES[@]}" -eq 0 ]; then
  warn "no /dev/cec* adapters found. On a Pi 5 they appear with the standard KMS display driver; check the TVs are plugged in."
else
  for dev in "${DEVICES[@]}"; do
    echo "--- $dev"
    if sudo cec-ctl -d "$dev" --playback --osd-name Dashboard >/dev/null 2>&1; then
      sudo cec-ctl -d "$dev" | grep -E 'Physical Address|Logical Address' | head -2 || true
      sudo cec-ctl -d "$dev" --to 0 --give-device-power-status 2>/dev/null | grep -i 'pwr-state' || echo "TV did not answer (is CEC on in the TV's settings?)"
    else
      warn "could not configure $dev"
    fi
  done
fi

if [ "$TEST" = 1 ] && [ "${#DEVICES[@]}" -gt 0 ]; then
  step "Testing: TVs off, then on again"
  for dev in "${DEVICES[@]}"; do sudo cec-ctl -d "$dev" --to 0 --standby >/dev/null || warn "$dev: standby failed"; done
  echo "Sent standby. Waiting 15 seconds..."
  sleep 15
  for dev in "${DEVICES[@]}"; do sudo cec-ctl -d "$dev" --to 0 --image-view-on >/dev/null || warn "$dev: power on failed"; done
  echo "Sent power on."
fi

step "Done"
echo "Set the on/off times on the admin page: Settings > TV power (HDMI-CEC)."
if [ "$NEEDS_REBOOT" = 1 ]; then
  echo "Reboot once so the changes above take effect:  sudo reboot"
fi
