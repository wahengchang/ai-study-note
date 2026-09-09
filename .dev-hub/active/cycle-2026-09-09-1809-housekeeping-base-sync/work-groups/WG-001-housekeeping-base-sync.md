---
id: WG-001
status: completed
title: Housekeeping base synchronization
work_items: ["WI-001"]
owner: Main
branch: chore/housekeeping-base-sync
worktree: /Volumes/UGREEN 2TB /projects/ai-study-note-reset
pr: null
---

# Housekeeping Base Synchronization

## Delivery
更新 housekeeping 與入口 agent 文件，使已合併分支清理後的 `site-reset` 同步成為下一個工作開始前的必要條件。

## Verification
- `git diff --check`：通過。
- `.agents/skills/housekeeping/SKILL.md`、`AGENTS.md`、`CLAUDE.md`：都要求乾淨的 `site-reset` worktree 使用 `git pull --ff-only origin site-reset`，並在本機與遠端相同前阻擋下一個 branch／worktree。
- 已實際執行 `git pull --ff-only origin site-reset`；`site-reset` 同步到 `f145340`，且工作樹乾淨。