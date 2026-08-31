---
id: WG-009-media-reference-replacement
status: completed
title: 透過 SaveRevision 原子替換 current media reference
work_items:
  - WI-019
owner: Main
branch: cms/media-reference-replacement
worktree: .dev-hub/worktrees/media-reference-replacement
pr: https://github.com/wahengchang/ai-study-note/pull/296
---

# 透過 SaveRevision 原子替換 current media reference

## Delivery

把 #233 的媒體版本替換收斂為 `SaveRevision` 的 derived request variant，並補齊 PublishRevision 的 route／transaction race 與原子性缺口。

## Verification

`node --import tsx --test tests/core/application/save-revision-media-replacement.test.ts tests/core/application/publish-revision.test.ts tests/core/application/save-revision-plugin-composition.test.ts`（12 pass）；`node --import tsx --test "tests/core/application/*.test.ts"`（18 pass）；`npm run check`（118 pass）均通過。
