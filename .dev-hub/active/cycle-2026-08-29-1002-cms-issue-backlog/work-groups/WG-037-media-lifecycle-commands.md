---
id: WG-037
status: completed
title: Media detail and lifecycle commands
work_items: ["WI-047"]
owner: Main
branch: feature/media-lifecycle-commands
worktree: /Volumes/UGREEN 2TB /projects/ai-study-note-reset/.dev-hub/worktrees/media-lifecycle-commands
pr: https://github.com/wahengchang/ai-study-note/pull/362
---

# Media detail and lifecycle commands

## Delivery

以 PR #360 的 branch 為 stacked base，交付 Application-only Media detail、version replacement、archive 與 restore exact routes；不加入 CMS UI。

## Verification

`npm run typecheck`、`npm run check:architecture`、`git diff --check`、Media archive/restore 與 replacement core regressions，以及 actual-listener Media lifecycle regression 均通過。DataMedia 與 transport cross-review 均 ACCEPT。
