---
id: WG-023
status: completed
title: Article workspace runtime
work_items: ["WI-035", "WI-041", "WI-044", "WI-049", "WI-056"]
owner: Main
branch: feat/article-workspace-runtime
worktree: .dev-hub/worktrees/article-workspace-runtime
pr: https://github.com/wahengchang/ai-study-note/pull/337
---

# Article workspace runtime

## Delivery

交付 Article v1 的 `/cms`、`/cms/entries`、`/cms/entries/new` 與 `/cms/entries/:entryId` runtime：結構化 title/article block editor、current／published preview、dirty publish lock、二段 Publish、session-safe API client 與 keyboard/focus error handling。修正 browser module asset 與 same-origin authenticated fetch 的 exact admission，未新增未核准 CMS route。

## Plan

1. 在 `contracts/README.md` 定義 #281／#284／#289 的最小 strict transport DTO、Article v1 schema 與由 composition 注入的 exact Theme identity。
2. 擴充 Persistence read snapshot 與 Application public `AuthoringReadFacade`，以 defensive-copy immutable DTO 提供 content type、entry catalog/detail/history 與 canonical state read。
3. 將 #281／#284／#289 接入共用 `/v1/*` fixed-origin Bearer admission；preview 僅回 rendered `preview-document/v1`。
4. 為 seam 寫 contract/HTTP negative tests；通過後才解除 #315 UI runtime 的阻塞。

## Verification

2026-09-09：`npm run typecheck`、`npm run cms:build`、`node --import tsx --test tests/apps/authoring-api/http-contract.test.ts`（15/15）通過。實際 Chromium desktop flow 完成 empty → 建立 Article v1 → save/current preview → dirty publish lock → Escape dialog focus return → confirm publish → published preview；驗證 titled empty-sandbox iframe、skip link、roving preview tabs 與 focus return。
