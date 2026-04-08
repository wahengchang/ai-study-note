---
title: "OpenClaw 同步設定說明（以編輯為中心）"
tags:
  - sop
  - openclaw
  - devops
description: "Edit-centric sync between local and remote — workspace, skills, agent config, and cron with sync-ignore controls"
---

## 1) 需求摘要
- 本機作業主要是編輯：`workspace`、`skills`、`agent config` 和 `cron`。
- Remote 端可能會產生新的 Skills 或 Cron 項目；本機應拉取後進行編輯。
- 目標不是完整的機器備份，而是以編輯為導向的同步。

## 2) 最終決策
- 預設使用 sync-ignore / range 控制。
- 預設 scope 是 `edit`，而非 `full`。
- 預設會同步刪除（來源端刪除的檔案，目標端也會刪除）。
- `full` 僅用於遷移 / 災難復原 / 除錯。

## 3) Scope 模型

### 3.1 `edit`（預設，日常使用）
用途：將 Remote 的 Skill / Cron 更新拉到本機，再將本機編輯推回 Remote。

預設包含：
- `workspace/`
- `workspace-gg-helper/`
- `agents/*/agent/`
- `cron/jobs.json`
- `openclaw.json`

預設排除：
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

### 3.2 `state`（選用）
用途：需要時納入 Runtime 身分 / Channel 狀態。

額外包含：
- `identity/`
- `credentials/`
- `secret/`
- `devices/`
- `telegram/`
- `cron/runs/`
- `agents/*/sessions/sessions.json`

### 3.3 `full`（高風險）
用途：完整映像，用於遷移 / 備份 / 復原。
- 不套用任何預設 ignore 規則。
- 風險最高，不適合日常使用。

## 4) CLI 介面
- `./sync download`（Remote -> 本機）
- `./sync upload`（本機 -> Remote）

選項：
- `--scope edit|state|full`（預設：`edit`）
- `--yes` 實際執行（預設為 dry-run）
- `--dry-run` 強制預覽
- `--delete` 同步刪除（預設：啟用）
- `--no-delete` 單次停用刪除同步
- `--user --host --port --local-dir --remote-dir`

## 5) 日常工作流程
1. 拉取 Remote 最新編輯：
   - `./sync download --scope edit --yes`
2. 在本機編輯（`workspace*/skills`、`agents/*/agent/`、`cron/jobs.json` 等）。
3. 推回 Remote：
   - `./sync upload --scope edit --yes`

注意事項：
- 為減少覆寫風險，先 `download` 再 `upload`。
- 刪除同步預設開啟。如果某次需要保護，加上 `--no-delete`。

## 6) 驗收標準
- Remote 新增的 Skill（位於 `workspace-gg-helper/skills/...`）可透過 `download --scope edit` 拉取。
- Remote 的 `cron/jobs.json` 變更在本機可見且可編輯。
- Remote 的 `agents/*/agent/...` 變更在本機可見且可編輯。
- Remote 在 edit scope 內刪除的檔案，`download --yes` 後本機也會移除。
- 本機更新可透過 `upload --scope edit` 推送。
- 本機在 edit scope 內刪除的檔案，`upload --yes` 後 Remote 也會移除。
- `state` scope 可在需要時納入 identity / credential / channel 狀態。

## 7) 流程圖
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
