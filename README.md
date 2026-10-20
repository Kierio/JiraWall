# Jira Wall Dashboard

A live Jira dashboard for a team wall display, built for a **Raspberry Pi 5 with two 1920×1080 monitors**, definetely made by Kierio and not vibe coded with Claude in 15 minutes.

- **Stats as JQL widgets:** numbers, comparisons, daily trends, breakdown charts, leaderboards, issue lists, a recent-activity feed and a clock. You configure them from a web admin page.
- **Event rules:** each rule is a JQL filter plus a trigger, such as _ticket closed_, _new ticket_ or _urgent ticket created_. When a rule fires, both screens play a random animation from that rule's pool: 👍 thumbs-up bursts, confetti cannons, fireworks, balloons, a rocket launch, a trophy spotlight, a siren, and more.
- **Two independent screens:** `/screen/1` and `/screen/2`, each with its own drag-and-drop layout.
- **TV power schedule:** the Pi turns the TVs on and off over HDMI-CEC at times you set (weekdays only, if you like).
- **UK radio:** BBC, Global, Bauer and other stations through the TVs' speakers, with station and volume controls on the admin page.

## Contents

1. [How it works](#how-it-works)
2. [Before you start: Jira API access](#before-you-start-jira-api-access)
3. [Install on the Raspberry Pi](#install-on-the-raspberry-pi)
4. [Configure the dashboard](#configure-the-dashboard)
5. [Develop on your computer (mock mode)](#develop-on-your-computer-mock-mode)
6. [Troubleshooting](#troubleshooting)

---

## How it works

| Piece             | Choice                                                                                  | Why                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Server            | Node.js 22 + TypeScript + Fastify, run by systemd                                       | Light enough for a Pi. It is the only part that holds the Jira token.                                   |
| Screens and admin | React + Vite, Chart.js, canvas-confetti, Web Animations API                             | Animations use only GPU-friendly transforms and opacity, so they run smoothly on a Pi 5.                |
| Live updates      | Server-Sent Events (`/api/stream`)                                                      | The server queries Jira once per widget per interval, however many screens are open.                    |
| Jira connection   | Polling the Jira Cloud REST API v3                                                      | Jira webhooks need a public HTTPS endpoint. Polling works from the office LAN with no firewall changes. |
| Storage           | `data/config.json` (widgets, layout, rules) and `data/state.json` (events already seen) | Plain JSON written atomically. Back it up with the admin's Export button.                               |

**How events are detected.** Every 20 s, each enabled rule runs:

```
(<project scope>) AND (<rule filter>) AND (<trigger field> >= "-15m") ORDER BY <trigger field> DESC
```

- **No repeats.** Each issue and trigger timestamp is remembered, so nothing celebrates twice, even across restarts. A ticket that is reopened and closed again gets a new timestamp, so it celebrates again.
- **No burst on startup.** A new or edited rule first records what already matches, without animating.
- **One rule per event.** If one issue matches several rules at the same moment (for example _New ticket_ and _Urgent ticket created_), only the rule highest in the list fires.
- **Batching.** If more than 3 events for the same rule arrive in one check, they merge into one animation ("5 tickets closed! 🎉").
- **Alerts go first.** Alert-mood events jump the screen's animation queue.

---

## Before you start: Jira API access

You need four things: your **Jira site URL**, an **Atlassian account**, an **API token** for that account, and an **admin password** for the dashboard.

### 1. Pick the account the dashboard uses

The dashboard sees exactly what this account can see.

- **Recommended:** a dedicated account such as `jira-dashboard@yourcompany.com`, added to Jira with the **Browse projects** permission on the projects you want to show. It uses one Jira licence seat.
- **Simpler:** use your own account. The token then carries your permissions, and the dashboard stops working if you leave.

### 2. Create an API token

1. Sign in to Atlassian **as that account**, then open <https://id.atlassian.com/manage-profile/security/api-tokens>.
2. Click **Create API token**, name it `jira-dashboard`, and choose an expiry date. Tokens last at most one year, so **put a reminder in your calendar** to rotate it.
3. Copy the token now. Atlassian shows it only once.

> **Optional: a tighter, scoped token.** Choose **Create API token with scopes**, select **Jira**, and tick the read scopes `read:jira-work` and `read:jira-user`.
> Scoped tokens must go through Atlassian's API gateway, which needs your **Cloud ID**. Open `https://<your-site>.atlassian.net/_edge/tenant_info`, copy the `cloudId` value, and set it as `JIRA_CLOUD_ID` in `.env`.

### 3. Check that the token works

Run this from any computer:

```bash
curl -u you@yourcompany.com:YOUR_TOKEN https://yourcompany.atlassian.net/rest/api/3/myself
```

You should get JSON containing your `displayName`. A `401` means the email or token is wrong.

### 4. Find out how your workflow marks things "done"

In Jira's issue search, run `resolved >= -7d`.

- **Tickets you know were closed are listed:** your workflow sets a Resolution.
- **They're missing:** your workflow doesn't set a Resolution. That's fine: the default _Ticket closed_ rule uses `statusCategory = Done` with the `statusCategoryChangedDate` trigger, which works with every workflow.

### 5. Network

- The Pi needs **outbound HTTPS to `*.atlassian.net`** (and `api.atlassian.com` for scoped tokens).
- If your Atlassian organisation uses **IP allowlisting**, add your office's public IP. Otherwise the dashboard gets `403` errors.

### What goes in `.env`

```ini
JIRA_BASE_URL=https://yourcompany.atlassian.net
JIRA_EMAIL=jira-dashboard@yourcompany.com
JIRA_API_TOKEN=paste-the-token-here
JIRA_CLOUD_ID=              # only for scoped tokens
ADMIN_PASSWORD=pick-something-long
PORT=3000
```

The token stays on the Pi. It is only ever sent from the server to Jira, and never to the browsers.

---

## Install on the Raspberry Pi

1. **Flash the OS.** Use Raspberry Pi Imager to install **Raspberry Pi OS (64-bit) with desktop**. In Imager's settings, enable SSH and set your Wi-Fi or use Ethernet.
2. **Connect the monitors.** Use both micro-HDMI ports. HDMI0, nearest the USB-C power socket, becomes the **left** monitor and shows screen 1.
3. **Copy the project** to the Pi, for example `git clone <your repo> ~/JiraStats`. Alternatively, copy the folder with `scp -r`, leaving out `node_modules` and `dist`.
4. **Run the installer** as your normal user, not root. You can do this over SSH:
   ```bash
   cd ~/JiraStats
   bash deploy/install.sh
   ```
   It installs Node.js 22 if it's missing, builds the app, and installs the `jira-dash` server as a systemd service. It then runs `deploy/setup-kiosk.sh` to set up the screens at boot (see below).
5. **Fill in `.env`,** then restart the server:
   ```bash
   nano ~/JiraStats/.env
   sudo systemctl restart jira-dash
   ```
6. **Reboot** with `sudo reboot`. The Pi logs in to the desktop by itself, and each monitor opens its screen full screen.

The installer also runs `deploy/setup-cec.sh` so the Pi can switch the TVs on and off (see [TV power](#settings--tv-power-hdmi-cec)).

### Updating an existing install

```bash
cd ~/JiraStats
bash deploy/update.sh
```

This pulls the latest code, rebuilds, sets up anything new (currently HDMI-CEC for the TV schedule), and restarts the server and the screens. If it tells you to reboot (the first time it sets up CEC), run `sudo reboot`.

### Start-on-boot kiosk (`deploy/setup-kiosk.sh`)

`install.sh` runs this for you. Run it on its own to change kiosk settings or to set the kiosk up again. It makes these changes:

| What                                                                                                                                          | How                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Installs Chromium, the **Noto Color Emoji** font (without it, emoji show as boxes), `unclutter` (hides the pointer) and the X11 display tools | `apt`                                                                                            |
| Logs in to the desktop automatically and turns off screen blanking                                                                            | `raspi-config nonint`                                                                            |
| Switches the desktop session to **X11**, unless you pass `--wayland`                                                                          | `raspi-config nonint do_wayland W1`                                                              |
| Runs `deploy/kiosk.sh` at every login                                                                                                         | `~/.config/autostart/jira-dash-kiosk.desktop`, plus `~/.config/labwc/autostart` with `--wayland` |
| Saves your choices                                                                                                                            | `~/.config/jira-dash/kiosk.conf`                                                                 |
| With `--wayland` only: window rules that move each screen to its HDMI output and make it full screen                                          | a marked block in `~/.config/labwc/rc.xml`                                                       |

At login, `deploy/kiosk.sh` does the following:

1. Under X11, places the two HDMI outputs side by side and stops the screen saver and monitor power-off.
2. Waits until the dashboard server answers.
3. Opens `/screen/1` on the left monitor and `/screen/2` on the right, each a full-screen Chromium window with its own profile.
4. Relaunches either window within 5 s if it closes or crashes.

It writes a log to `~/.config/jira-dash/kiosk.log`, and only one copy runs at a time.

```bash
bash deploy/setup-kiosk.sh                 # X11 session (recommended)
bash deploy/setup-kiosk.sh --swap          # screens came up the wrong way round
bash deploy/setup-kiosk.sh --wayland       # keep Raspberry Pi OS's default Wayland (labwc) session
bash deploy/setup-kiosk.sh --url http://dash-server:3000   # show a dashboard served from another machine
bash deploy/setup-kiosk.sh --reboot        # reboot when done
```

- **X11 vs Wayland:** X11 is the default because placing windows on a specific monitor is reliable there. The `--wayland` mode uses labwc window rules instead. It should work, but check it on your Pi; if both screens land on one monitor, re-run without `--wayland`.
- **Re-running is safe.** Options can be combined, e.g. `--wayland --swap`. `install.sh` passes its options through, so `bash deploy/install.sh --swap` works too.

**Day-to-day commands**

| Task                                        | Command                                                               |
| ------------------------------------------- | --------------------------------------------------------------------- |
| Server logs                                 | `journalctl -u jira-dash -f`                                          |
| Restart the server                          | `sudo systemctl restart jira-dash`                                    |
| Kiosk log                                   | `cat ~/.config/jira-dash/kiosk.log`                                   |
| Restart the kiosk browsers (works over SSH) | `bash deploy/restart-kiosk.sh`                                        |
| Screens on the wrong monitors               | `bash deploy/setup-kiosk.sh --swap`, then reboot (or swap the cables) |
| Stop opening the browsers at boot           | `bash deploy/remove-kiosk.sh`                                         |
| Update an existing install                  | `bash deploy/update.sh` (pulls, rebuilds, restarts)                   |
| Reload the screens remotely                 | Admin page → **Reload screens**                                       |

Chromium restarts automatically if it crashes. The screens also reload themselves:

- once a day at 04:00, which you can change in Settings
- after 5 minutes without a server connection

---

## Configure the dashboard

Open `http://<pi-ip>:3000/admin` from your laptop and sign in with `ADMIN_PASSWORD`. Changes are a draft until you click **Save**, then both screens update live.

### Settings → Project scope (do this first)

Set a scope such as `project in (ABC, DEF)`. It is ANDed onto every event rule and every widget that has _Apply project scope_ turned on.

Jira Cloud's search API rejects **unbounded** queries (ones with no restriction at all), so either set a scope or restrict each query yourself. Use **Test JQL** next to any query to see the match count and sample issues before you save.

### Settings → Theme

Choose **Dark**, **Light** or **Scheduled** for both screens. Scheduled shows light between two times you pick (default 08:00–18:00, the Pi's local time) and dark the rest of the day. The screens switch on their own with a gentle fade, and the window may cross midnight (e.g. 22:00–06:00).

The admin page has its own ☀️/🌙 switch in the top bar: **Match screens**, Dark or Light, remembered in your browser only. Chart colours use validated palettes for each theme, so series keep their meaning in both.

### Settings → TV power (HDMI-CEC)

Turn on **Switch the TVs on and off automatically**, pick an on time, an off time and the days (default Mon–Fri, 08:00–18:00, the Pi's local time). At the on time the Pi wakes each TV and switches it to the Pi's input; at the off time it puts them in standby. Only the switch times act, so a TV someone turns on by hand out of hours stays on until the next scheduled change. **Turn on now** / **Turn off now** work any time, and the status line shows each TV's power state.

It uses `cec-ctl` (from `v4l-utils`). `deploy/install.sh` and `deploy/update.sh` set it up by running `deploy/setup-cec.sh`, which:

- installs `v4l-utils` and adds your user to the `video` group (access to `/dev/cec0` and `/dev/cec1`, one per HDMI port);
- registers the Pi as a playback device on each port and prints each TV's power state;
- adds `video=HDMI-A-1:1920x1080@60D video=HDMI-A-2:…` to `/boot/firmware/cmdline.txt` (a backup is kept) so both outputs stay enabled while the TVs sleep. Without it some TVs drop the HDMI link in standby and the screens can come back on the wrong monitor. Skip it with `--no-force-hdmi`.

Run `bash deploy/setup-cec.sh --test` to turn the TVs off and back on. The TVs must have CEC turned on in their own settings; brands call it Anynet+ (Samsung), Bravia Sync (Sony), SimpLink (LG) or EasyLink (Philips).

### Radio

The **Radio** tab plays a UK station through one screen's HDMI output, so the sound comes from that TV's speakers. Changes apply straight away, without **Save**:

- **Play/Stop**, a **volume** slider, and **Play on** to pick the screen.
- **Only while the TVs are on** pauses the radio outside the TV power schedule.
- Preset stations: BBC Radio 1, 1Xtra, 2, 3, 4, 4 Extra, 5 Live and 6 Music; Capital, Capital XTRA, Heart, Smooth, Classic FM, Radio X, LBC and Gold; Absolute, KISS, Magic and Greatest Hits Radio; Times Radio, talkSPORT and Virgin Radio.
- **Find another station** searches UK stations on radio-browser.info. You can also paste any MP3/AAC stream or `.m3u8` address.

Animation sound effects still play on top. The clock widget shows the station while the radio is on.

### Widgets

| Type                  | What it shows                                                                                                                | Example JQL                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Number                | Count of matching issues, with an optional amber/red threshold                                                               | `type = Bug AND statusCategory != Done`                                                   |
| Number vs. comparison | Two counts and the change between them                                                                                       | `created >= startOfWeek()` vs `created >= startOfWeek("-1w") AND created < startOfWeek()` |
| Daily trend           | Count per day over N days, bucketed on a date field. Optionally overlay a second line, e.g. created vs closed (see below)     | Base `statusCategory = Done`, date field `statusCategoryChangedDate`                      |
| Breakdown chart       | Bar or doughnut grouped by any field: `status`, `assignee`, `priority`, `issuetype`, `labels`, `components`, `customfield_…` | `statusCategory != Done`                                                                  |
| Leaderboard           | People ranked by count                                                                                                       | `statusCategory = Done AND statusCategoryChangedDate >= startOfWeek()`                    |
| Issue list            | Top N issues; use ORDER BY                                                                                                   | `statusCategory != Done ORDER BY priority DESC, created ASC`                              |
| Recent events         | Feed of the latest event-rule animations                                                                                     | _(none)_                                                                                  |
| Clock & status        | Time, date and connection status                                                                                             | _(none)_                                                                                  |
| Picture               | An image from a web address (logo, webcam, chart), fitted or filling the card, optionally reloaded every N seconds           | _(none)_                                                                                  |

**Created vs closed (trend overlay):** turn on *Overlay a second line* on a trend widget, or click **⚡ Created vs closed preset**. The widget then shows:

- closed per day (blue) and created per day (orange) on the same axis, with a legend;
- each line's value for today;
- a net summary, e.g. "Created 113 · Closed 140 · Net −27 ▼ shrinking". *Growing* means more tickets came in than were closed.

The net summary can be turned off. Fresh installs ship with this as the default trend widget.

**How trends count:** each line is one Jira search over the whole period. The issues' dates are bucketed into days on the Pi's own clock, so the days match the chart labels even when the Jira account is set to another timezone. Counts are exact. When an event rule fires, trends and number widgets refresh within a few seconds instead of waiting for their next refresh. Above 3,000 issues per line, a trend falls back to one count query per day.

**If the Closed line looks wrong, check the date field.** `statusCategoryChangedDate` only changes when an issue moves *between* categories. So in a workflow with Resolved → Closed (both in the Done category) the close isn't counted again, and an issue that was closed, reopened and closed again only counts on the last day. If your workflow sets a Resolution, `resolved` with base JQL `resolution is not EMPTY` may match what you mean by "closed" better.

**Priority icons:** issue lists, animation banners, the recent-events feed, the admin's test results, and breakdowns grouped by `priority` all show Jira-style icons. The shape carries the meaning, not just the colour:

| Icon | Level | Also matches |
| --- | --- | --- |
| ⏫ red double chevron up | Highest | Blocker, Critical, Urgent, P0, P1 |
| 🔼 orange chevron up | High | Major, P2 |
| ═ amber bars | Medium | Normal, P3 |
| 🔽 blue chevron down | Low | Minor, P4 |
| ⏬ grey double chevron down | Lowest | Trivial, P5 |

Names like "P2 - High" or "Critical (P1)" work too. Breakdowns grouped by priority are sorted Highest → Lowest.

**Layout tab:** each screen is a 12×6 grid. Drag a widget to move it, and drag its corner to resize. Overlaps are outlined in red.

**Jira load:** each widget runs on its own refresh interval (default 60 s). A trend makes one search per line (paged, 100 issues per request), so 300 s is still a sensible refresh for busy projects.

### Event rules

| Field      | Meaning                                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Filter JQL | Which tickets qualify, e.g. `priority in (Highest, High)`. Don't include the time window or scope; they're added for you.                         |
| Fires when | The date that marks the moment: **Created**, **Status category changed** (e.g. moved to Done), **Resolved**, **Updated**, or a custom date field. |
| Credit     | Whose name and avatar appear: the person who changed the status (read from the changelog), the assignee, the reporter, or nobody.                 |
| Banner     | Text template with `{person} {key} {summary} {priority} {type} {status} {rule}`. The batch banner supports `{count}`.                             |
| Mood       | 🎉 celebrate, 📬 info or 🚨 alert. Alerts jump the queue.                                                                                         |
| Animations | Pick specific animations, or leave empty to use any enabled animation of the rule's mood.                                                         |
| Order      | ▲▼ arrows. When one ticket matches several rules at once, the top rule wins.                                                                      |

**Testing a rule:**

- **What would have fired in the last 24h?** runs the rule against real Jira data.
- **Preview here** plays the animation on your laptop only.
- **Fire on screens** plays it on the wall.

The **Add rule** menu includes presets: Bug squashed, Story shipped, Bug reported and Blocker raised.

### Animations

32 animations in five packs. Every animation shows a banner with the person, ticket key, summary and priority icon.

| Pack | Celebrate | Info | Alert |
| --- | --- | --- | --- |
| Classic | Thumbs-up burst, confetti cannons, emoji rain, fireworks, balloons, rocket launch, trophy spotlight, bubble pop | Mailbox drop, paper plane, ticket print, sparkle pulse | Siren, priority alarm, hazard stripes |
| Party | Champagne pop 🍾, disco ball, dance floor 🕺, birthday cake 🎂 | | |
| Game | Level up 🎮, slot machine 🎰, coin shower 💰, arcade high score 🕹️ | | |
| Space & nature | Shooting stars 🌠, floating hearts ❤️, rainbow 🌈 | Sunrise 🌅 | |
| Alert & info | | Radar ping 📡, news ticker 📰, doorbell 🔔 | "This is fine" fire 🔥, lighthouse |

On the Animations tab you can:
- turn whole packs or single animations on or off;
- set the duration and the sound volume;
- preview any animation on your laptop (**▶ Here**) or on the wall (**📺 Screens**).

Sound and safety:
- Sounds are synthesised in the browser, so there are no audio files. Some animations have their own sound: a cork pop, slot-machine reels, an 8-bit level-up, a ding-dong, and coin chimes.
- Nothing flashes faster than about 1 Hz; lights fade or sweep instead of strobing.
- Only emoji from Emoji 12 or earlier are used, so they draw on any up-to-date emoji font. The disco ball, coins and lighthouse are drawn with CSS.

To add a new animation:

1. Add an entry to `shared/animations.ts` (id, name, mood, pack, emoji, optional sound).
2. Implement it in the matching file in `web/src/animations/library/`. Each animation is an `async (stage) => {}` function built from the helpers in `stage.ts`.
3. `npm test` fails until every catalogue entry has an implementation.

--------- | --------------------------------------------------------------------------------------------------------------- |
| Celebrate | Thumbs-up burst, confetti cannons, emoji rain, fireworks, balloons, rocket launch, trophy spotlight, bubble pop |
| Info      | Mailbox drop, paper plane, ticket print, sparkle pulse                                                          |
| Alert     | Siren, priority alarm, hazard stripes. These pulse at 1 Hz or slower and never strobe.                          |

On the Animations tab you can turn each animation on or off, set the duration and the sound volume, and preview any animation on your laptop or on the screens. Sounds are synthesised in the browser, so there are no audio files.

To add a new animation:

1. Add an entry to `shared/animations.ts`.
2. Implement it in `web/src/animations/library.ts`. Each animation is an `async (stage) => {}` function.

---

## Develop on your computer (mock mode)

No Jira needed. Mock mode uses a built-in fake Jira that creates, progresses and closes tickets every few seconds, so widgets move and animations fire.

```bash
npm install
npm run dev:mock
```

| Page                                  | URL                                                                |
| ------------------------------------- | ------------------------------------------------------------------ |
| Screens (Vite dev server, hot reload) | <http://localhost:5173/screen/1>, <http://localhost:5173/screen/2> |
| Admin (password `admin` in mock mode) | <http://localhost:5173/admin>                                      |

| Command                               | What it does                                                                                                                           |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                            | Unit tests (Vitest): event detection, overlap and batching, JQL building, the Jira client's paging and 429 backoff, widget aggregation |
| `npm run typecheck`                   | TypeScript checks for server and web                                                                                                   |
| `npm run build && npm run start:mock` | Production build served by the Node server on <http://localhost:3000>                                                                  |

To try against real Jira locally, create `.env` as above, then run `npm run dev`.

### Project layout

```
server/            Fastify app (index.ts), Jira client, widget scheduler, event engine, SSE, admin API
  mock/            fake Jira + a small JQL interpreter for mock mode
shared/            types, JQL helpers, animation catalogue and rule presets (used by server and web)
web/src/screen/    the wall screens
web/src/widgets/   widget components
web/src/animations/ animation packs (library/), queue/overlay, sounds, animations.css
web/src/admin/     admin page (Widgets, Layout, Event rules, Animations, Radio, Settings)
server/tv/         HDMI-CEC TV power (cec-ctl) and its schedule
deploy/            install.sh, update.sh, setup-kiosk.sh (boot kiosk), setup-cec.sh (TV power), kiosk.sh, restart-/remove-kiosk.sh, systemd unit
test/              Vitest unit tests
```

---

## Troubleshooting

| Symptom                                           | Fix                                                                                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Jira 401`                                        | Wrong email or token, or the token expired. Create a new one and update `.env`.                                                                         |
| `Jira 403`                                        | The account can't browse the project, or IP allowlisting is blocking the Pi.                                                                            |
| `Jira 400 … unbounded` / `JQL query is too broad` | Set a **project scope** in Settings, or add a restriction to the query.                                                                                 |
| `Jira 404` with a scoped token                    | Set `JIRA_CLOUD_ID`. Scoped tokens only work through `api.atlassian.com`.                                                                               |
| `Jira 429`                                        | Rate limited. The server backs off automatically. Raise widget refresh intervals, especially for trends.                                                |
| Emoji show as boxes on the Pi                     | `sudo apt install fonts-noto-color-emoji`, then reboot.                                                                                                 |
| Both screens open on one monitor                  | Re-run `bash deploy/setup-kiosk.sh` (X11 mode), reboot, then check `~/.config/jira-dash/kiosk.log`. It lists the outputs it found, and should list two. |
| Kiosk doesn't start at boot                       | Check that desktop auto-login is on (`sudo raspi-config` → System Options → Boot / Auto Login), then read `~/.config/jira-dash/kiosk.log`.              |
| No sound                                          | Rules have their own sound toggle, and the Animations tab has a volume slider. Check the monitor or speaker volume too.                                 |
| Closed tickets never celebrate                    | Use **What would have fired in the last 24h?** on the rule. If it's empty, adjust the filter or try the _Resolved_ trigger.                             |
| TVs don't switch on/off                           | Settings → TV power shows each TV's state. Run `bash deploy/setup-cec.sh --test` and check CEC is on in the TVs' own menus. `journalctl -u jira-dash` logs every switch. |
| No radio                                          | Check the Radio tab's **Play on** screen and volume, and the TV's own volume. If **Only while the TVs are on** is set, the radio is paused outside the TV schedule. Some streams go offline: try another station. |
| Want a fresh start                                | Stop the service, delete `data/`, then start it again. Defaults are recreated.                                                                          |

## Security notes

- Keep `.env` private: the installer sets it to `chmod 600`, and git ignores it.
- The admin page is password protected. Screens are read-only and need no login, because they're meant for the office LAN. **Don't expose port 3000 to the internet.**
- Use a dedicated read-only account where possible, and rotate its token before it expires.
