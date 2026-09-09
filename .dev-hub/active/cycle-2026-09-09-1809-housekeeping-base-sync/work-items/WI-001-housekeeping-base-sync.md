---
id: WI-001
status: done
title: Synchronize site-reset after post-merge housekeeping
work_group: WG-001
depends_on: []
---

# Synchronize site-reset after post-merge housekeeping

## Outcome
Housekeeping 在清理已合併分支後，以乾淨的 `site-reset` worktree 執行 fast-forward 同步，並確認下一個 branch／worktree 使用最新基底。

## Acceptance
`AGENTS.md`、`CLAUDE.md` 與 housekeeping skill 一致規定此流程；dirty base worktree 阻擋同步；同步只允許 fast-forward，且報告結果。

## Notes
Owner 已確認此規則為必要的預設工作流；已完成文件與 skill 更新。