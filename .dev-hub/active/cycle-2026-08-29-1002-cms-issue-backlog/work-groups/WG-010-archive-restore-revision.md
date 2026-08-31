---
id: WG-010
status: completed
title: 媒體封存復原與 RestoreRevision
work_items: ["WI-021", "WI-022"]
owner: Main
branch: cms/archive-restore-asset
worktree: .dev-hub/worktrees/archive-restore-asset
pr: https://github.com/wahengchang/ai-study-note/pull/297
---

# 媒體封存復原與 RestoreRevision

## Delivery

完成 ArchiveAsset／RestoreAsset 的可信 availability state transition，以及 RestoreRevision 的 transaction-bound current revision 還原。

## Verification

`node --import tsx --test tests/core/media/archive-restore-asset.test.ts`、`tests/core/application/restore-revision.test.ts`、全部 core media/application tests 及 `npm run check` 均通過；詳細實際結果見 `logs/2026-08-31-1754-archive-restore-revision.md`。
