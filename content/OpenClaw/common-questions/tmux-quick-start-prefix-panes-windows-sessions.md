---
title: tmux Quick Start for OpenClaw (Prefix, Panes, Windows, Sessions)
---

## Objective

- Provide a fast tmux reference for OpenClaw daily operations.
- Cover the minimum command set: split panes, switch windows, detach/reattach sessions.

## Assumptions / Verification Status

- This note is based on user-provided guidance and common tmux defaults.
- Commands are not executed in this note.
- Verify in your environment:

```bash
tmux -V
tmux list-keys | head
```

## Core Rule: Prefix Key

- tmux commands are triggered with a **Prefix** key sequence.
- Default Prefix: `Ctrl+b`.

### Usage Pattern

1. Press `Ctrl+b`.
2. Release keys.
3. Press the command key.

## Install and Start

```bash
brew install tmux
tmux
```

- `brew install tmux`: install on macOS (Homebrew).
- `tmux`: start a new tmux session.

## Pane Management (Splits)

| Action | Keys |
| --- | --- |
| Split left/right (vertical split) | `Prefix` then `%` |
| Split top/bottom (horizontal split) | `Prefix` then `"` |
| Move between panes | `Prefix` then arrow keys |
| Close active pane (confirm) | `Prefix` then `x` |
| Zoom/unzoom active pane | `Prefix` then `z` |

## Window Management (Tabs)

| Action | Keys |
| --- | --- |
| New window | `Prefix` then `c` |
| Next window | `Prefix` then `n` |
| Previous window | `Prefix` then `p` |
| Jump to window `0-9` | `Prefix` then `0..9` |
| Close active window | `Prefix` then `&` |

## Session Management (Keep Work Running)

| Action | Keys / Command |
| --- | --- |
| Detach from current session | `Prefix` then `d` |
| Reattach to last session | `tmux attach` |
| List sessions | `tmux ls` |

- Detach keeps processes running in background.
- Reattach restores panes/windows exactly where you left off.

## Suggested OpenClaw Layout

### 2-Pane Workflow

| Pane | Use |
| --- | --- |
| Left pane | Run gateway (`openclaw gateway --port 18789`) |
| Right pane | Run CLI checks / browser commands / logs |

### Example Session

```bash
tmux
# Split into left/right panes: Prefix, %

# Left pane
openclaw gateway --port 18789

# Right pane
openclaw --help
```

## Troubleshooting

| Problem | Likely Cause | Check |
| --- | --- | --- |
| Keybindings do nothing | Not in tmux session | Confirm prompt/status line; run `echo $TMUX` |
| Prefix not working | Custom tmux config changed prefix | Check `~/.tmux.conf` |
| `tmux attach` fails | No active session | Run `tmux ls`, then start with `tmux` |

## Minimal Cheat Sheet

| Action | Shortcut |
| --- | --- |
| Prefix | `Ctrl+b` |
| Split left/right | `Prefix`, `%` |
| Split top/bottom | `Prefix`, `"` |
| Move panes | `Prefix`, arrows |
| New window | `Prefix`, `c` |
| Next window | `Prefix`, `n` |
| Detach | `Prefix`, `d` |
| Reattach | `tmux attach` |
