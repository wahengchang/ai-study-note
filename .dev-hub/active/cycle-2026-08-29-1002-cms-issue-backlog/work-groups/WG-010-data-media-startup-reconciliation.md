---
id: WG-010-data-media-startup-reconciliation
status: completed
title: DataMedia 啟動安全收斂中斷匯入
work_items:
  - WI-013
owner: Main
branch: cms/data-media-startup-reconciliation
worktree: .dev-hub/worktrees/data-media-startup-reconciliation
pr: null
---

# DataMedia 啟動安全收斂中斷匯入

## Delivery

完成 durable media intent／local object storage 的安全 startup reconciliation，將 operational factory 收斂為 `startDataMedia()`，並切換全部六個實際組裝呼叫端。

## Verification

`node --import tsx --test tests/core/media/startup-reconciliation.test.ts tests/core/media/local-import.test.ts tests/core/media/published-selection.test.ts`（10 pass）；`node --import tsx --test tests/core/application/save-revision.test.ts tests/core/application/save-revision-media-replacement.test.ts tests/core/application/save-revision-plugin-composition.test.ts tests/core/application/publish-revision.test.ts tests/core/application/save-revision-failures.test.ts`（20 pass）；`npm run check`（128 pass）均通過。詳見 `logs/2026-09-01-1645-data-media-startup-reconciliation.md`。