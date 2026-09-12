---
id: WG-048
status: completed
title: Core Issue acceptance closeout
work_items: ["WI-002", "WI-003", "WI-004", "WI-005"]
owner: Main
branch: chore/backlog-closeout-batch
worktree: .dev-hub/worktrees/backlog-closeout-batch
pr: null
---

# Core Issue acceptance closeout

## Delivery

逐條核對 GitHub #215–#218 的 Application、SiteDefinition、DataMedia 與 PluginHost acceptance；僅在既有已合併交付完整覆蓋時關閉母 Issue，並修正 WI-002–005 的實際依賴。

## Verification

- `node --import tsx --test tests/core/application/*.test.ts tests/core/site-definition/*.test.ts tests/core/media/*.test.ts tests/core/plugin-host/*.test.ts`：97/97 通過。
- `node --import tsx --test --test-concurrency=1 tests/apps/authoring-api/http-contract.test.ts`：31/31 通過。
- `npm run cms:build` 後 `tests/apps/cms/runtime-browser-gate.test.ts tests/apps/cms/article-workspace.test.ts`：8/8 真實 Chromium browser/a11y journeys 通過。
- #215、#216、#217、#218 已以 COMPLETED 關閉；PR 建立後回填唯一 PR URL。
