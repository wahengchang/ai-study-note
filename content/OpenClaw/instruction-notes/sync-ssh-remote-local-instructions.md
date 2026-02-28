# OpenClaw Sync Setup Instructions (Edit-First)

## 1) Requirement Summary
- Local work is mainly editing: `workspace`, `skills`, `agent config`, and `cron`.
- Remote may create new skills/cron entries; local should pull them for editing.
- The goal is not full machine backup. The goal is edit-focused sync.

## 2) Final Decisions
- Use sync-ignore/range control by default.
- Default scope is `edit`, not `full`.
- Deletions are synced by default (if source deletes, target deletes).
- Use `full` only for migration/disaster-recovery/troubleshooting.

## 3) Scope Model

### 3.1 `edit` (default, daily use)
Purpose: bring remote skill/cron updates local, then push local edits back.

Included by default:
- `workspace/`
- `workspace-gg-helper/`
- `agents/*/agent/`
- `cron/jobs.json`
- `openclaw.json`

Excluded by default:
- `agents/*/sessions/*.jsonl*`
- `logs/`
- `browser/openclaw/user-data/`
- `media/`
- `delivery-queue/`
- `cron/runs/`
- `update-check.json`
- `*.bak`
- `*.bak.*`
- `.DS_Store`
- `._*`
- `Thumbs.db`
- `*.tmp`
- `*.swp`

### 3.2 `state` (optional)
Purpose: include runtime identity/channel state when needed.

Additional includes:
- `identity/`
- `credentials/`
- `secret/`
- `devices/`
- `telegram/`
- `cron/runs/`
- `agents/*/sessions/sessions.json`

### 3.3 `full` (high risk)
Purpose: full mirror for migration/backup/recovery.
- No default ignore rules.
- Highest risk; not for daily workflow.

## 4) CLI Interface
- `./sync download` (remote -> local)
- `./sync upload` (local -> remote)

Options:
- `--scope edit|state|full` (default: `edit`)
- `--yes` real execution (default is dry-run)
- `--dry-run` force preview
- `--delete` sync deletions (default: enabled)
- `--no-delete` disable deletion sync for one run
- `--user --host --port --local-dir --remote-dir`

## 5) Daily Workflow
1. Pull latest remote edits:
   - `./sync download --scope edit --yes`
2. Edit locally (`workspace*/skills`, `agents/*/agent/`, `cron/jobs.json`, etc.).
3. Push back to remote:
   - `./sync upload --scope edit --yes`

Notes:
- To reduce overwrite risk, run `download` before `upload`.
- Deletion sync is on by default. Use `--no-delete` when you need one-off protection.

## 6) Acceptance Criteria
- Remote new skill under `workspace-gg-helper/skills/...` is pulled by `download --scope edit`.
- Remote `cron/jobs.json` changes are visible and editable locally.
- Remote `agents/*/agent/...` changes are visible and editable locally.
- Remote delete in edit scope is removed locally after `download --yes`.
- Local updates are pushed by `upload --scope edit`.
- Local delete in edit scope is removed remotely after `upload --yes`.
- `state` scope can be used to include identity/credential/channel state when required.

## 7) ASCII Flow
```text
Remote changes (skills/cron/agent config)
                  |
                  v
    ./sync download --scope edit --yes
                  |
                  v
             Local editing
                  |
                  v
     ./sync upload --scope edit --yes
                  |
                  v
            Remote updated
```
