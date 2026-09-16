---
id: WG-001
status: completed
title: WI-001｜建立 current-only CPT 與全域 slug
work_items: [WI-001]
owner: domain_application_engineer
branch: wg-001-current-only-cpt-global-slug
worktree: .dev-hub/worktrees/current-only-cpt-global-slug
pr: https://github.com/wahengchang/ai-study-note/pull/386
---

## Delivery

- 交付 current-only Content Type、global slug、Application、Authoring API 與 CMS Builder 的完整垂直切片。

## Verification

- `npm run check`：307/307 通過；含 typecheck、architecture、CMS production build 與 browser gate。
- `npm run dev-hub:overview:check`：通過。
- isolated `cms:init`／`cms:start`：以 repository 外 temporary HOME 成功完成 0012 migration 與服務啟動；managed Chromium harness 異常要求未連線 relay，改由既有真實 browser gate 證明 UI surface。
