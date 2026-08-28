---
id: WG-001-published-route-claim
status: completed
title: Published route claim
work_items:
  - WI-001
owner: Main
branch: cms/published-route-claim
worktree: .dev-hub/worktrees/published-route-claim
pr: null
---

# Published route claim

## Delivery

以單一 Branch／Worktree 交付 SiteDefinition published claim、雙圖隔離測試與現況文件。

## Verification

- Node `24.20.0`／npm `11.19.0`：`node --import tsx --test "tests/core/site-definition/*.test.ts"`，6 tests passed。
- Node `24.20.0`／npm `11.19.0`：`npm run check`，80 tests passed；TypeScript 與 architecture checker 均通過。
- `npm run dev-hub:overview`、`npm run dev-hub:overview:check` 與 `node --import tsx --test tests/scripts/render-dev-hub-overview.test.ts` 均通過。