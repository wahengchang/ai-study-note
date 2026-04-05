---
title: "Ch6: Agent Workspace（快速回顧）"
aliases:
  - openclaw/ch6-workspace
  - openclaw/workspace-recap
tags:
  - reference
  - openclaw
description: "Agent workspace as home directory — identity files, context files, memory, and backup via private git"
---

本章目的：快速理解 OpenClaw Workspace 的定位——它是 Agent 的家目錄、Memory 的存放表面，也是日常操作的工作目錄。
![[workspace.png]]

概觀：上圖將 Workspace 呈現為一個操作中樞，內含三組檔案：**Identity & Behavior**（`AGENTS.md`、`SOUL.md`、`IDENTITY.md`）、**Context & Operations**（`USER.md`、`TOOLS.md`、`BOOT.md`/`HEARTBEAT.md`）、以及 **Memory**（`memory/YYYY-MM-DD.md`、`MEMORY.md`）。圖中也強調了硬性排除項目（Secrets、`openclaw.json`、Session Transcripts），說明 Workspace 預設是 `cwd` 而非嚴格的 Sandbox（除非啟用 `agents.defaults.sandbox`），並呈現透過 Private Git Repo 進行備份與遷移清理的流程。

## 一頁摘要

| 主題 | 重點回顧 |
| --- | --- |
| Workspace 是什麼 | Agent 的家目錄，用於 File Tool、Context 檔案和 Memory 檔案 |
| 預設路徑 | `~/.openclaw/workspace` |
| Profile 路徑 | `~/.openclaw/workspace-<profile>` |
| Sandbox 預設值 | 預設不是硬性 Sandbox，主要作為預設 `cwd` |
| 關鍵邊界 | Workspace 不是 Config / Secrets 的存放處 |

## 1. 核心概念與路徑

Workspace 是 Agent 讀寫工作檔案與 Memory 的地方。

- 預設：`~/.openclaw/workspace`
- Profile 模式：`~/.openclaw/workspace-<profile>`

Sandboxing 提醒：

- 沒有啟用 `agents.defaults.sandbox` 的情況下，Workspace 只是預設工作目錄，不具備嚴格隔離。
- 相對路徑會以 Workspace 為基準，但絕對路徑仍可能跳出 Workspace，除非有啟用 Sandboxing。

## 2. Workspace 檔案地圖（「大腦」檔案）

以下是各檔案的實務用途對照表。

| 群組 | 檔案 | 用途 |
| --- | --- | --- |
| Identity and Behavior | `AGENTS.md` | 操作指令、規則、優先順序 |
| Identity and Behavior | `SOUL.md` | 人設、語氣、行為邊界 |
| Identity and Behavior | `IDENTITY.md` | Agent 名稱與基本身份 |
| Context and Operations | `USER.md` | 使用者資料與互動偏好 |
| Context and Operations | `TOOLS.md` | Tool 使用指引與慣例 |
| Context and Operations | `BOOT.md` / `HEARTBEAT.md` | 選用的啟動 / Heartbeat 檢查清單 |
| Memory | `memory/YYYY-MM-DD.md` | 每日 append-only Memory 日誌 |
| Memory | `MEMORY.md`（選用） | 精選的長期 Memory（僅限 Private Session） |

實際讀取行為：

- Agent 啟動時通常會讀取「今天 + 昨天」的每日 Memory 日誌。

## 3. 安全性與排除項目（重要）

不要把 Workspace 當成 Secret 的存放處。

| 不該放進 Workspace 的東西 | 原因 |
| --- | --- |
| API Key、OAuth Token、密碼 | Workspace 經常會被備份或版本控管 |
| `openclaw.json` | Config 應放在 State/Config 目錄，不是 Memory Workspace |
| Session Transcripts（`~/.openclaw/agents/...`） | 屬於操作日誌，有獨立的生命週期和敏感度 |

原則：

- 如果是 Secret 或 Runtime 控制檔案，就不該放在 Workspace 的 Markdown 裡。

## 4. 備份與維護

把 Workspace 當作可跨機器搬移的私人 Memory 狀態。

| 任務 | 建議做法 |
| --- | --- |
| 備份 | 為 Workspace 建立一個 Private Git Repo |
| 遷移 | 在新機器上 Clone Repo，並將 `agents.defaults.workspace` 指向它 |
| 清理 | 避免產生多餘的重複 Workspace 資料夾，以免造成狀態混淆 |

## Operator 快速檢查清單

1. 確認 Config / Profile 中的 Active Workspace 路徑
2. 確認關鍵的「大腦」檔案存在（`AGENTS.md`、`SOUL.md`、`USER.md`）
3. 確認 Memory 檔案有持續寫入（`memory/YYYY-MM-DD.md`）
4. 確認 Secrets 沒有存放在 Workspace 中
5. 確認備份 / 遷移流程已測試通過

## 快速心智模型

- Workspace = 可編輯的 Memory + 操作指令
- Config = Gateway / Runtime 設定
- Sessions = 對話日誌

把這三個表面分開管理，就能避免大多數的操作失誤。

## Related

- [[ch5-memory-storage-and-retrieval|Ch5: Memory]]
- [[ch7-multi-agent-and-presence-quick-recap|Ch7: Multi-Agent and Presence]]
- [[workspace-modification-guideline|Workspace 修改指南]]
