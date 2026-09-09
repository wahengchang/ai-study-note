---
id: cycle-2026-09-09-1809-housekeeping-base-sync
status: active
created_at: 2026-09-09T18:09:42+08:00
updated_at: 2026-09-09T18:11:21+08:00
---

# Housekeeping Base Synchronization

## Goal
讓 post-merge housekeeping 在清理已合併分支後，將 `site-reset` fast-forward 同步至遠端，確保下一個 branch 與 worktree 從最新基底建立。

## Scope
更新 housekeeping skill 與入口 agent 指令，並驗證本機 `site-reset` 同步流程。

## Context
`site-reset` 是預設主整合分支。既有 housekeeping 禁止同步基底分支，與 Owner 要求的下一個工作必須從同步基底開始相衝突。