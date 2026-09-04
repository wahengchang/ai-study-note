---
id: WG-017
status: completed
title: Projection Preview Core Document
work_items: ["WI-053"]
owner: Main
branch: feature/preview-core
worktree: .dev-hub/worktrees/preview-core
pr: https://github.com/wahengchang/ai-study-note/pull/311
---

# Projection Preview Core Document

## Delivery

完成 `Projection.preview()` 的 read-only structured preview document，隔離 current/published revision 並對 raw/demos 產生 sandbox+fallback output。

## Verification

`npm run typecheck`、Projection targeted tests（5/5）與 `npm run check`（192/192）均通過。
