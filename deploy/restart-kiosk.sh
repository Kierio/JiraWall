#!/usr/bin/env bash
# Restarts the two kiosk browser windows, e.g. after changing kiosk.conf or if a
# screen looks stuck. Works over SSH: kiosk.sh relaunches Chromium within ~5 seconds.
#   bash deploy/restart-kiosk.sh
set -u

PROFILE_ROOT="$HOME/.config/jira-dash"

if pkill -f -- "--user-data-dir=$PROFILE_ROOT/screen"; then
  echo "Closed the kiosk browsers; kiosk.sh will reopen them in about 5 seconds."
else
  echo "No kiosk browsers were running."
  if ! pgrep -f "deploy/kiosk.sh" >/dev/null; then
    echo "kiosk.sh isn't running either. It starts at desktop login, so reboot (sudo reboot),"
    echo "or run deploy/kiosk.sh from a terminal on the Pi's desktop."
  fi
fi
