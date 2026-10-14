#!/usr/bin/env bash
# Opens the two dashboard screens as full-screen Chromium windows, one per monitor.
# Started automatically at login (set up by deploy/setup-kiosk.sh). You can also run
# it by hand from a terminal on the Pi's desktop.
#
# Settings come from ~/.config/jira-dash/kiosk.conf (written by setup-kiosk.sh):
#   DASH_URL          dashboard server, default http://localhost:3000
#   SWAP_SCREENS=1    show screen 2 on the left monitor and screen 1 on the right
#   LEFT_WIDTH        width of the left monitor in pixels (X11 only), default 1920
#   SCREEN_WIDTH / SCREEN_HEIGHT   monitor resolution (X11 only), default 1920x1080
#
# Works under both desktop sessions Raspberry Pi OS offers:
#   X11      - windows are placed with --window-position (most reliable)
#   Wayland  - labwc window rules (installed by setup-kiosk.sh --wayland) move each
#              window to its HDMI output and make it full screen
set -u

PROFILE_ROOT="$HOME/.config/jira-dash"
CONF="$PROFILE_ROOT/kiosk.conf"
mkdir -p "$PROFILE_ROOT"
# shellcheck source=/dev/null
[ -f "$CONF" ] && . "$CONF"

DASH_URL="${DASH_URL:-http://localhost:3000}"
LEFT_WIDTH="${LEFT_WIDTH:-1920}"
SCREEN_WIDTH="${SCREEN_WIDTH:-1920}"
SCREEN_HEIGHT="${SCREEN_HEIGHT:-1080}"
SWAP_SCREENS="${SWAP_SCREENS:-0}"

LOG="$PROFILE_ROOT/kiosk.log"
# Keep the log from growing forever.
if [ -f "$LOG" ] && [ "$(wc -c <"$LOG")" -gt 1000000 ]; then mv "$LOG" "$LOG.old"; fi
exec >>"$LOG" 2>&1
echo "=== kiosk start $(date) ==="

# Only one copy may run (the session may start it from more than one autostart file).
exec 9>"$PROFILE_ROOT/kiosk.lock"
if command -v flock >/dev/null && ! flock -n 9; then
  echo "kiosk.sh is already running; exiting."
  exit 0
fi

if [ -n "${WAYLAND_DISPLAY:-}" ]; then SESSION=wayland; else SESSION=x11; fi
echo "session: $SESSION, dashboard: $DASH_URL, swap: $SWAP_SCREENS"

# --- display setup -------------------------------------------------------------
if [ "$SESSION" = x11 ]; then
  if command -v xset >/dev/null; then
    xset s off      # no screensaver
    xset -dpms      # never power the monitors down
    xset s noblank
  fi
  # Put the two connected outputs side by side, first one on the left.
  if command -v xrandr >/dev/null; then
    mapfile -t outputs < <(xrandr --query | awk '/ connected/{print $1}')
    echo "X11 outputs: ${outputs[*]:-none}"
    if [ "${#outputs[@]}" -ge 2 ]; then
      xrandr --output "${outputs[0]}" --mode "${SCREEN_WIDTH}x${SCREEN_HEIGHT}" --pos 0x0 \
        --output "${outputs[1]}" --mode "${SCREEN_WIDTH}x${SCREEN_HEIGHT}" --pos "${LEFT_WIDTH}x0" ||
        echo "xrandr could not set the layout; using the current one"
    else
      echo "WARNING: fewer than two monitors detected; both screens will open on the same one."
    fi
  fi
  # Hide the mouse pointer (the pages also hide it with CSS).
  command -v unclutter >/dev/null && unclutter -idle 0.5 -root &
fi

# --- wait for the dashboard server --------------------------------------------
until curl -sf "$DASH_URL/api/status" >/dev/null; do
  echo "waiting for $DASH_URL ..."
  sleep 2
done

CHROMIUM="$(command -v chromium || command -v chromium-browser || true)"
if [ -z "$CHROMIUM" ]; then
  echo "Chromium not found. Install it with: sudo apt install chromium"
  exit 1
fi

COMMON_FLAGS=(
  --noerrdialogs
  --disable-infobars
  --no-first-run
  --no-default-browser-check
  --disable-session-crashed-bubble
  --disable-features=Translate,TranslateUI
  --autoplay-policy=no-user-gesture-required
  --check-for-update-interval=31536000
  --password-store=basic
  --overscroll-history-navigation=0
  --disable-pinch
)

# Are the labwc window rules from setup-kiosk.sh --wayland installed?
labwc_rules() {
  grep -q 'jira-dash:begin' "$HOME/.config/labwc/rc.xml" 2>/dev/null
}

# Runs one screen and restarts Chromium whenever it exits or crashes.
#   $1 = screen number (1 or 2), $2 = x offset of the monitor it belongs on (X11)
run_screen() {
  local screen="$1" x="$2"
  local profile="$PROFILE_ROOT/screen$screen"
  local url="$DASH_URL/screen/$screen"
  local flags=("${COMMON_FLAGS[@]}" --user-data-dir="$profile")

  if [ "$SESSION" = x11 ]; then
    flags+=(--ozone-platform=x11 --kiosk --window-position="$x,0" --window-size="$SCREEN_WIDTH,$SCREEN_HEIGHT" "$url")
  elif labwc_rules; then
    # The window's app id (from --class) is matched by the labwc rule, which moves the
    # window to the right HDMI output and makes it full screen.
    flags+=(--ozone-platform=wayland --class="JiraDashScreen$screen" --app="$url")
  else
    echo "WARNING: no labwc window rules found; both windows may open on one monitor."
    echo "         Run deploy/setup-kiosk.sh --wayland, or switch to X11."
    flags+=(--ozone-platform=wayland --class="JiraDashScreen$screen" --kiosk "$url")
  fi

  while true; do
    # Stop Chromium from offering to "restore pages" after a power cut.
    if [ -f "$profile/Default/Preferences" ]; then
      sed -i 's/"exited_cleanly":false/"exited_cleanly":true/; s/"exit_type":"[^"]*"/"exit_type":"Normal"/' "$profile/Default/Preferences"
    fi
    echo "starting screen $screen: $url"
    "$CHROMIUM" "${flags[@]}"
    echo "screen $screen: Chromium exited ($?); restarting in 5s"
    sleep 5
  done
}

if [ "$SWAP_SCREENS" = "1" ]; then
  run_screen 2 0 &
  sleep 3
  run_screen 1 "$LEFT_WIDTH" &
else
  run_screen 1 0 &
  sleep 3 # let the first window settle before the second appears
  run_screen 2 "$LEFT_WIDTH" &
fi
wait
