---
title: OpenClaw Browser CLI - Install, Profiles, and Common Scenarios
---

## Install (First-Time Setup)

### Prerequisites

- OpenClaw gateway is running and you know your Gateway Token.
- Chrome is installed (for Extension Relay mode).
- Verify browser commands exist:

```bash
openclaw browser --help
```

### Install Chrome Extension (Extension Relay)

```bash
openclaw browser extension install
```

- Copy the printed extension folder path.
- Open `chrome://extensions`.
- Enable `Developer mode`.
- Click `Load unpacked` and select the printed folder.
- Open the extension settings/popup:
  - Set relay port (commonly `18792`)
  - Enter your Gateway Token
- Open the target webpage and click the extension icon until it shows `ON`.

![[../assets/OpenCLaw/chrome-extension.png]]

### First Connection Test

```bash
openclaw browser snapshot
```

- If you get element IDs (`<ref>`), Extension Relay is connected.
- If it fails, check:
  - Extension is installed and enabled
  - Extension is attached to the correct tab
  - Port/token match the OpenClaw gateway config

## Objective

- Build a reusable command-line reference for OpenClaw browser usage.
- Focus on:
  - Extension Relay install/connect flow
  - Profile creation and reuse
  - Common CLI commands
  - 3 practical automation scenarios (separate tables)

## Assumptions / Verification Status

- Commands below are compiled from prior working notes/conversation examples.
- They are not locally executed in this note.
- Exact flags may differ by OpenClaw version; verify with:

```bash
openclaw browser --help
```

## Quick Command Table (Extension Relay + Page Control)

| Command                                         | What it does                                                        | Example                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `openclaw browser snapshot`                     | Read current page structure and interactive elements (`<ref>` IDs). | `openclaw browser snapshot`                                        |
| `openclaw browser snapshot --labels`            | Generate labeled screenshot with element IDs.                       | `openclaw browser snapshot --labels`                               |
| `openclaw browser highlight <ref>`              | Visually highlight an element before acting.                        | `openclaw browser highlight 15`                                    |
| `openclaw browser click <ref>`                  | Click an element by reference ID.                                   | `openclaw browser click 15`                                        |
| `openclaw browser type <ref> "text"`            | Type into an input/textarea.                                        | `openclaw browser type 3 "Latest AI news"`                         |
| `openclaw browser evaluate --fn "..."`          | Run JavaScript in the page context.                                 | `openclaw browser evaluate --fn "return document.title"`           |
| `openclaw browser evaluate and wait --fn "..."` | Run JS and wait for page changes/load.                              | `openclaw browser evaluate and wait --fn "window.scrollBy(0,500)"` |

## Common Question: How To Install Browser Extension (Extension Relay)

### Symptom

- Error indicates OpenClaw is trying to use **Extension Relay mode** but the Chrome extension is not installed/connected.

### Install + Connect Steps

| Step | Action                           | Command / UI                                                |
| ---- | -------------------------------- | ----------------------------------------------------------- |
| 1    | Generate extension files locally | `openclaw browser extension install`                        |
| 2    | Open Chrome extensions page      | `chrome://extensions`                                       |
| 3    | Enable Developer Mode            | Toggle in top-right                                         |
| 4    | Load unpacked extension          | Click `Load unpacked` and select generated folder           |
| 5    | Configure extension              | Set relay port (commonly `18792`) and enter Gateway Token   |
| 6    | Attach to active tab             | Click extension icon on target page until status shows `ON` |

### Notes

- Extension Relay controls the currently attached tab (your live browser session).
- Actions may use your logged-in cookies/session.
- Use `snapshot` first to inspect page element IDs before `click` or `type`.

## Common Question: How To Create and Reuse a Profile

### Profile Management Table

| Action                       | Description                                             | CLI Command                                              |
| ---------------------------- | ------------------------------------------------------- | -------------------------------------------------------- |
| Create profile               | Create isolated browser state (cookies/session storage) | `openclaw browser create-profile --name my_profile`      |
| Launch visibly (first login) | Open dedicated browser so you can log in manually once  | `openclaw browser launch --profile my_profile --visible` |
| Reuse profile                | Run future browser commands with saved session          | `openclaw browser snapshot --profile my_profile`         |

### Recommended First-Time Flow

```bash
openclaw browser create-profile --name social_bot
openclaw browser launch --profile social_bot --visible
# Log in manually in the opened browser window

# Later, reuse the same session silently
openclaw browser snapshot --profile social_bot
```

## Scenario 1: Logged-In Social Media Poster (Profile Reuse)

- Goal: Post to X / LinkedIn using a saved session profile.

| Step | Action                      | Command / Logic                                                |
| ---- | --------------------------- | -------------------------------------------------------------- |
| 1    | Login once and save session | `openclaw browser launch --profile social_bot --visible`       |
| 2    | Inspect compose page        | `openclaw browser snapshot --profile social_bot`               |
| 3    | Type post content           | `openclaw browser type 12 "Hello world!" --profile social_bot` |
| 4    | Publish                     | `openclaw browser click 15 --profile social_bot`               |

## Scenario 2: Clean-State Price Tracker (No Cookies)

- Goal: Check prices without personalized cookies/history affecting results.

| Step | Action                    | Command / Logic                                                                       |
| ---- | ------------------------- | ------------------------------------------------------------------------------------- |
| 1    | Start clean browser state | Omit `--profile`                                                                      |
| 2    | Navigate to product page  | `openclaw browser evaluate and wait --fn "window.location='https://store.com/item';"` |
| 3    | Scrape visible price      | `openclaw browser evaluate --fn "return document.querySelector('.price')?.innerText"` |
| 4    | Automate daily run        | Wrap in shell script + scheduler (`cron`/other)                                       |

### Minimal Script Template (Price Check)

```bash
#!/usr/bin/env bash
set -euo pipefail

URL="https://store.com/item"

openclaw browser evaluate and wait --fn "window.location='${URL}'"
openclaw browser evaluate --fn "return document.querySelector('.price')?.innerText"
```

## Scenario 3: TL;DR Agent Summarizer (Agent + Browser Tool)

- Goal: Send a URL to your agent (e.g., Telegram workflow) and receive a short summary.

| Step | Action                            | Command / Logic                                                             |
| ---- | --------------------------------- | --------------------------------------------------------------------------- |
| 1    | Enable browser tool for the agent | Add `browser` to agent tools config (e.g., `agent.json`)                    |
| 2    | Trigger from chat                 | Send URL + prompt (example: `Read this and give me 3 bullet points: <URL>`) |
| 3    | Agent reads page                  | Agent uses browser snapshot/evaluate internally                             |
| 4    | Receive summary                   | Agent returns summarized bullets/messages                                   |

## Practical Workflow Tips

- Start with `snapshot`; use `snapshot --labels` when element IDs are hard to map.
- Use `highlight <ref>` before destructive actions (`Delete`, `Submit`, `Buy`, etc.).
- Keep separate profiles per site/account (`social_bot`, `research`, `admin_test`).
- For scraping, prefer stable selectors (IDs/data attributes) over fragile CSS class names.

## Quick Troubleshooting Table

| Problem                         | Likely Cause                                   | First Check                                                                |
| ------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------- |
| Extension Relay error           | Chrome extension not installed or not attached | Run `openclaw browser extension install`, then verify extension shows `ON` |
| Commands act on wrong page      | Extension attached to different tab            | Click extension icon on the intended tab                                   |
| Logged-in action fails          | Profile not reused / session expired           | Confirm `--profile <name>` is included and relogin with `--visible`        |
| `click/type` hits wrong element | Wrong `<ref>` selected                         | Use `snapshot --labels` + `highlight <ref>`                                |

## Self-Check Commands (Before Automation)

```bash
openclaw browser --help
openclaw browser snapshot
openclaw browser snapshot --labels
```

## Debug CLI Sanity Checks (Install, Relay Attach, and Health)

Use this sequence when Extension Relay is not attaching or browser control commands are failing.

### 1) Extension install and load path

```bash
openclaw browser extension install
openclaw browser extension path
```

- `install` copies MV3 extension files into a stable OpenClaw state directory (not `node_modules`).
- `path` prints the exact folder to use with `Load unpacked` in `chrome://extensions`.

### 2) Confirm browser profiles

```bash
openclaw browser profiles
```

- Confirms Chrome profile integration is available.

### 3) Check relay-attached tabs (key verification)

```bash
openclaw browser --browser-profile chrome tabs
openclaw browser --browser-profile chrome tabs --json
```

- If a tab is attached (extension badge shows `ON`), it should appear in this list.
- `--json` is useful for machine-readable diagnostics and scripting.

### 4) Basic control test after tab attach

```bash
openclaw browser --browser-profile chrome snapshot
openclaw browser --browser-profile chrome screenshot
openclaw browser --browser-profile chrome open https://google.com
```

- Validates read (`snapshot`), render capture (`screenshot`), and navigation (`open`) in one pass.

### 5) Gateway and service health

```bash
openclaw status --deep
openclaw gateway status
openclaw gateway restart
openclaw logs --follow
```

- `status --deep` is the fastest full-stack health probe.
- Use `logs --follow` when the extension shows `!` or cannot reach relay.

### 6) Sandbox diagnostics

```bash
openclaw sandbox explain
```

- Use this when local sandboxing may block host browser control.
