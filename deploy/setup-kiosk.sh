#!/usr/bin/env bash
# Configures the Raspberry Pi to open the two dashboard screens full screen on
# monitors 1 and 2 every time it boots.
#
# Run once, on the Pi, as your normal desktop user (not root):
#   bash deploy/setup-kiosk.sh            # X11 session (recommended)
#   bash deploy/setup-kiosk.sh --wayland  # keep the default Wayland (labwc) session
#
# Options:
#   --x11               switch the desktop to X11 (default; most reliable window placement)
#   --wayland           stay on Wayland/labwc and use labwc window rules instead
#   --url URL           dashboard server to show (default http://localhost:3000)
#   --swap              screen 2 on the left monitor, screen 1 on the right
#   --left-width PX     width of the left monitor (default 1920)
#   --no-system         don't install packages or change raspi-config settings
#   --reboot            reboot when finished
#
# Safe to run again, e.g. with --swap if the screens come up the wrong way round.
# Undo with deploy/remove-kiosk.sh.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SESSION=x11
DASH_URL=http://localhost:3000
SWAP=0
LEFT_WIDTH=1920
SYSTEM=1
REBOOT=0

usage() { sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    --x11) SESSION=x11 ;;
    --wayland) SESSION=wayland ;;
    --url) DASH_URL="${2:?--url needs a value}"; shift ;;
    --swap) SWAP=1 ;;
    --left-width) LEFT_WIDTH="${2:?--left-width needs a value}"; shift ;;
    --no-system) SYSTEM=0 ;;
    --reboot) REBOOT=1 ;;
    -h | --help) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
  shift
done

if [ "$(id -u)" = "0" ]; then
  echo "Run this as your normal desktop user, not root (it uses sudo where needed)."
  exit 1
fi

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33mWARNING:\033[0m %s\n' "$*"; }

CONF_DIR="$HOME/.config/jira-dash"
AUTOSTART_DIR="$HOME/.config/autostart"
LABWC_DIR="$HOME/.config/labwc"
BEGIN='jira-dash:begin'
END='jira-dash:end'

# Removes a marked block (between lines containing BEGIN and END) from a file.
strip_block() {
  [ -f "$1" ] || return 0
  sed -i "/$BEGIN/,/$END/d" "$1"
}

# ---------------------------------------------------------------------------
if [ "$SYSTEM" = 1 ]; then
  step "Installing packages (Chromium, emoji font, pointer hider, display tools)"
  sudo apt-get update
  CHROMIUM_PKG=chromium
  apt-cache show chromium >/dev/null 2>&1 || CHROMIUM_PKG=chromium-browser
  # fonts-noto-color-emoji: without it the emoji animations show as empty boxes.
  sudo apt-get install -y "$CHROMIUM_PKG" fonts-noto-color-emoji unclutter curl x11-xserver-utils util-linux

  if command -v raspi-config >/dev/null; then
    step "Configuring Raspberry Pi OS (auto-login, no screen blanking, desktop session)"
    # B4 = boot to desktop, logged in automatically as this user
    sudo raspi-config nonint do_boot_behaviour B4 || warn "could not enable desktop auto-login; set it in raspi-config > System Options > Boot / Auto Login"
    # 1 = disable screen blanking
    sudo raspi-config nonint do_blanking 1 || warn "could not disable screen blanking; set it in raspi-config > Display Options"
    if [ "$SESSION" = x11 ]; then
      # W1 = X11
      sudo raspi-config nonint do_wayland W1 || warn "could not switch to X11; do it in raspi-config > Advanced Options > Wayland > X11"
    else
      command -v labwc >/dev/null || warn "labwc not found. The Wayland rules need the labwc session (raspi-config > Advanced Options > Wayland)."
    fi
  else
    warn "raspi-config not found (not Raspberry Pi OS?). Set up desktop auto-login and disable screen blanking yourself."
  fi
fi

# ---------------------------------------------------------------------------
step "Writing kiosk settings to $CONF_DIR/kiosk.conf"
mkdir -p "$CONF_DIR"
cat >"$CONF_DIR/kiosk.conf" <<EOF
# Settings for deploy/kiosk.sh. Re-run deploy/setup-kiosk.sh to change them,
# or edit here and run deploy/restart-kiosk.sh.
DASH_URL=$DASH_URL
SWAP_SCREENS=$SWAP
LEFT_WIDTH=$LEFT_WIDTH
SCREEN_WIDTH=1920
SCREEN_HEIGHT=1080
EOF
chmod +x "$DIR/deploy/kiosk.sh" "$DIR/deploy/restart-kiosk.sh" "$DIR/deploy/remove-kiosk.sh" 2>/dev/null || true

# ---------------------------------------------------------------------------
step "Adding kiosk.sh to the desktop's startup programs"
# XDG autostart works for the X11 (LXDE) session, and for labwc on Raspberry Pi OS.
mkdir -p "$AUTOSTART_DIR"
cat >"$AUTOSTART_DIR/jira-dash-kiosk.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Jira Dashboard Kiosk
Comment=Opens the two dashboard screens full screen on monitors 1 and 2
Exec=$DIR/deploy/kiosk.sh
X-GNOME-Autostart-enabled=true
EOF
echo "  $AUTOSTART_DIR/jira-dash-kiosk.desktop"

if [ "$SESSION" = wayland ]; then
  # A user labwc file replaces the system one, so start from the system copy to keep
  # the normal Raspberry Pi desktop behaviour.
  mkdir -p "$LABWC_DIR"

  step "Adding kiosk.sh to labwc's autostart"
  if [ ! -f "$LABWC_DIR/autostart" ] && [ -f /etc/xdg/labwc/autostart ]; then
    cp /etc/xdg/labwc/autostart "$LABWC_DIR/autostart"
  fi
  touch "$LABWC_DIR/autostart"
  strip_block "$LABWC_DIR/autostart"
  {
    echo "# $BEGIN (added by JiraStats deploy/setup-kiosk.sh; kiosk.sh ignores duplicate starts)"
    echo "$DIR/deploy/kiosk.sh &"
    echo "# $END"
  } >>"$LABWC_DIR/autostart"
  echo "  $LABWC_DIR/autostart"

  step "Adding labwc window rules that put each screen on its own monitor"
  if [ "$SWAP" = 1 ]; then OUT1=HDMI-A-2; OUT2=HDMI-A-1; else OUT1=HDMI-A-1; OUT2=HDMI-A-2; fi
  RC="$LABWC_DIR/rc.xml"
  if [ ! -f "$RC" ]; then
    if [ -f /etc/xdg/labwc/rc.xml ]; then
      cp /etc/xdg/labwc/rc.xml "$RC"
    else
      printf '<?xml version="1.0"?>\n<labwc_config>\n</labwc_config>\n' >"$RC"
    fi
  fi
  strip_block "$RC"
  ROOT_CLOSE="$(grep -o '</\(labwc\|openbox\)_config>' "$RC" | tail -1)"
  if [ -z "$ROOT_CLOSE" ]; then
    warn "$RC has no </labwc_config> tag; not adding window rules."
  else
    RULES_FILE="$(mktemp)"
    cat >"$RULES_FILE" <<EOF
  <!-- $BEGIN: Jira dashboard kiosk windows (managed by deploy/setup-kiosk.sh) -->
  <windowRules>
    <windowRule identifier="JiraDashScreen1" serverDecoration="no">
      <action name="MoveToOutput" output="$OUT1" />
      <action name="ToggleFullscreen" />
    </windowRule>
    <windowRule identifier="JiraDashScreen2" serverDecoration="no">
      <action name="MoveToOutput" output="$OUT2" />
      <action name="ToggleFullscreen" />
    </windowRule>
  </windowRules>
  <!-- $END -->
EOF
    # Insert the rules just before the last closing root tag.
    if awk -v closetag="$ROOT_CLOSE" -v rules="$RULES_FILE" '
      { lines[NR] = $0; if (index($0, closetag)) last = NR }
      END {
        for (i = 1; i <= NR; i++) {
          if (i == last) { while ((getline line < rules) > 0) print line }
          print lines[i]
        }
      }' "$RC" >"$RC.tmp" && grep -q "$BEGIN" "$RC.tmp"; then
      mv "$RC.tmp" "$RC"
      echo "  $RC  (screen 1 -> $OUT1, screen 2 -> $OUT2)"
    else
      rm -f "$RC.tmp"
      warn "could not add the window rules to $RC"
    fi
    rm -f "$RULES_FILE"
    # Apply immediately if labwc is running.
    if pgrep -x labwc >/dev/null; then labwc --reconfigure 2>/dev/null || true; fi
  fi
else
  # Switching back from Wayland: remove our labwc additions so they can't interfere.
  strip_block "$LABWC_DIR/autostart"
  strip_block "$LABWC_DIR/rc.xml"
fi

# ---------------------------------------------------------------------------
step "Done"
cat <<EOF
On every boot the Pi will now:
  1. log in to the desktop automatically,
  2. run $DIR/deploy/kiosk.sh, which waits for the dashboard at $DASH_URL,
  3. open /screen/1 full screen on the $([ "$SWAP" = 1 ] && echo right || echo left) monitor and /screen/2 on the $([ "$SWAP" = 1 ] && echo left || echo right) one.

Useful afterwards:
  Kiosk log:                 $CONF_DIR/kiosk.log
  Restart the browsers:      bash deploy/restart-kiosk.sh
  Screens the wrong way:     bash deploy/setup-kiosk.sh $([ "$SESSION" = wayland ] && echo "--wayland ")--swap   (then reboot)
  Undo all of this:          bash deploy/remove-kiosk.sh
EOF

if [ "$REBOOT" = 1 ]; then
  echo "Rebooting in 5 seconds (Ctrl+C to cancel)..."
  sleep 5
  sudo reboot
else
  echo
  echo "Reboot to start the kiosk:  sudo reboot"
fi
