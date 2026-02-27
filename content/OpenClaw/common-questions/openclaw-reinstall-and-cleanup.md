---
title: OpenClaw Reinstall / Cleanup (Reset State Safely)
---

## Objective

- Clean up a broken or stale OpenClaw local state.
- Reinstall with a predictable reset flow.
- Preserve important config/workspace data before deletion.

## Assumptions / Verification Status

- This note is a practical cleanup playbook, not a recorded execution log.
- Exact commands may differ by OS/package manager/OpenClaw version.
- Verify available commands on your machine:

```bash
openclaw --help
openclaw setup --help
```

## When To Use This

- `openclaw` starts failing after upgrades or partial installs.
- Gateway/agent state is corrupted or inconsistent.
- You want a clean test environment.
- You need to rebuild local config from scratch.

## Important Data To Preserve (Before Cleanup)

- `~/.openclaw/openclaw.json` (gateway + agent config)
- `~/.openclaw/workspace/` (workspace files / memory inputs)
- `~/.openclaw/workspace-<profile>/` (profile-specific workspaces)
- `~/.openclaw/agents/.../sessions/` (session transcripts, if needed)

## Quick Triage (Before Deleting Everything)

### Symptom

- OpenClaw fails to start or behaves incorrectly, but root cause is unclear.

### Verification

```bash
which openclaw
openclaw --version
openclaw gateway --help
ls -la ~/.openclaw
```

- If binary exists and only state is broken, a state cleanup is usually enough.
- If binary is missing/broken, do state cleanup + reinstall binary.

## Cleanup Strategy (Recommended Order)

1. Stop running OpenClaw processes/services.
2. Backup `~/.openclaw` (or at least config/workspace).
3. Remove stale local state.
4. Reinstall/repair the `openclaw` binary.
5. Run `openclaw setup`.
6. Reapply config and verify gateway startup.

## 1) Stop OpenClaw

### Common Commands

```bash
# If running manually in terminal, stop with Ctrl+C first

# User service example (Linux systemd user service)
systemctl --user stop openclaw-gateway || true

# Optional: confirm no process remains
ps aux | grep openclaw
```

## 2) Backup Existing State

```bash
mkdir -p ~/openclaw-backups
cp -a ~/.openclaw ~/openclaw-backups/openclaw-$(date +%Y%m%d-%H%M%S)
```

- If disk space is a concern, back up only:
  - `~/.openclaw/openclaw.json`
  - `~/.openclaw/workspace*`

## 3) Clean Local State (Full Reset)

### Destructive Reset (Removes Local OpenClaw State)

```bash
rm -rf ~/.openclaw
```

- This removes config, workspaces, sessions, and cached state.
- Only run after backup if you need recovery options.

### Partial Cleanup (If You Want To Keep Config)

```bash
# Keep config, remove volatile runtime/session state only (adjust as needed)
rm -rf ~/.openclaw/agents
```

- Use partial cleanup first when you suspect session/transcript corruption.

## 4) Reinstall / Repair Binary

### Verify Binary Path First

```bash
which openclaw
```

- If the path points to a package manager install, reinstall using the same tool (npm/homebrew/manual installer used previously).
- If unsure, reinstall via your normal team-approved install method.

### Optional: Run Built-In Uninstall (If Supported By Your Version)

```bash
openclaw uninstall
```

- Some versions/package channels may not provide this subcommand.
- If `openclaw uninstall` is unavailable, uninstall via your package manager/manual install method, then reinstall.

## 5) Reinitialize OpenClaw

```bash
openclaw setup
```

### Reapply Core Config (Example)

```bash
openclaw config set gateway.mode local
openclaw config set gateway.auth.token YOUR_TOKEN
openclaw config set agent.model YOUR_MODEL
```

- Replace values with your actual environment settings.
- If you backed up `openclaw.json`, you can restore it instead of retyping config.

## 6) Verify Clean Reinstall

### Basic Checks

```bash
openclaw --version
openclaw config get gateway.mode
openclaw gateway --port 18789
```

- Expected result: gateway starts without prior errors and creates a fresh `~/.openclaw` tree.

## Common Failure Modes After Reinstall

| Problem | Likely Cause | First Check |
| --- | --- | --- |
| `openclaw: command not found` | Binary not installed / shell PATH issue | `which openclaw`, reinstall binary, restart shell |
| Setup succeeds but runtime still fails | Old service/process still running | `ps aux | grep openclaw`, stop old process |
| Config values missing | `~/.openclaw` was fully reset | Restore backup or rerun `openclaw config set ...` |
| Browser/extension features fail | Gateway token/port mismatch after reset | Recheck extension settings and gateway config |

## Minimal Full Reset Script (Copy/Paste)

```bash
#!/usr/bin/env bash
set -euo pipefail

systemctl --user stop openclaw-gateway || true

mkdir -p ~/openclaw-backups
cp -a ~/.openclaw ~/openclaw-backups/openclaw-$(date +%Y%m%d-%H%M%S) 2>/dev/null || true

rm -rf ~/.openclaw

openclaw setup
```

## Notes

- Prefer partial cleanup (`~/.openclaw/agents`) before full reset when debugging.
- Full reset is appropriate when upgrading across major versions or after repeated state corruption.
- If reinstalling the binary does not help, capture exact stderr from `openclaw gateway` and troubleshoot the specific subsystem (config, model provider, permissions, network, extension relay).
