---
id: WG-049
status: completed
title: Taxonomy service dedup 與 CMS taxonomy 表格 browser gate
work_items: ["WI-068"]
owner: Main
branch: fix/cms-taxonomy-workspace-review
worktree: null
pr: https://github.com/wahengchang/ai-study-note/pull/355
---

# Taxonomy service dedup 與 CMS taxonomy 表格 browser gate

## Delivery

`core/taxonomy/service.ts` 以 module-level `taxonomySnapshot`、`taxonomyTermRecord`、`collectImpact` 作為唯一實作，`createTaxonomy` closure 與 `commandResult`、`prepareMigration` 全部改為呼叫同一份；`prepareMigration` 不再注入 `getTerm`／`getImpact`／`fail`。`tests/apps/cms/runtime-browser-gate.test.ts` 新增 real `startCmsRuntime` Chromium journey，覆蓋先前完全未執行的非空 taxonomy catalog 表格與 term 表格 render 路徑。

## Verification

`npm run typecheck`、`npm run cms:build`、`npm run check:architecture`、`git diff --check` 通過。`node --import tsx --test-concurrency=1 --test "tests/**/*.test.ts"` 264/264 通過，含 `tests/apps/cms/runtime-browser-gate.test.ts` 6/6 real Chromium browser/a11y journeys 與既有 5 項 Taxonomy core 測試。本次執行環境的 pinned Playwright Chromium 無法下載，改以既有 Chromium build 提供 `PLAYWRIGHT_BROWSERS_PATH` 執行；未變更任何測試或 CI 設定。
