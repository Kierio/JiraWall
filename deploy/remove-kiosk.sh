#!/usr/bin/env bash
# Undoes deploy/setup-kiosk.sh: the browsers no longer open at boot.
# The dashboard server (jira-dash service) and the raspi-config settings are left alone.
#   bash deploy/remove-kiosk.sh
set -u

BEGIN='jira-dash:begin'
END='jira-dash:end'
strip_block() {
  [ -f "$1" ] || return 0
  sed -i "/$BEGIN/,/$END/d" "$1" && echo "Removed kiosk entries from $1"
}

rm -f "$HOME/.config/autostart/jira-dash-kiosk.desktop" && echo "Removed ~/.config/autostart/jira-dash-kiosk.desktop"
strip_block "$HOME/.config/labwc/autostart"
strip_block "$HOME/.config/labwc/rc.xml"
rm -f "$HOME/.config/jira-dash/kiosk.conf"

# Stop the running kiosk (the launcher first, so it doesn't relaunch the browsers).
pkill -f "deploy/kiosk.sh" 2>/dev/null
pkill -f -- "--user-data-dir=$HOME/.config/jira-dash/screen" 2>/dev/null
echo "Kiosk stopped. Browser profiles are kept in ~/.config/jira-dash (delete it to remove them too)."
echo "To turn off desktop auto-login: sudo raspi-config > System Options > Boot / Auto Login."
