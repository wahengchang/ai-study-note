---
id: WG-024
status: completed
title: CMS browser authoring journey remediation
work_items: ["WI-058"]
owner: Main
branch: fix/cms-browser-authoring-journey
worktree: .dev-hub/worktrees/cms-browser-authoring-journey
pr: https://github.com/wahengchang/ai-study-note/pull/328
---

# CMS browser authoring journey remediation

## Delivery

修正 CMS module asset 的 same-origin `Origin` gate、authenticated browser GET 對合法省略 `Origin` 的 Fetch Metadata gate，並把 Article v1 的 required `seo` 納入 Content／Projection canonical shape 與 CMS reload/save round-trip；未改變跨站拒絕、CLI path 或 Preview renderer 的 URL／HTML sink。

## Verification

`npm run typecheck` 通過。`structured-read-model.test.ts`、`strict-parse.test.ts`、`http-contract.test.ts`、`cms-serve.test.ts` 在互不搶占固定 43127 listener 時均通過。`npm run check` 的唯一失敗是現有 `cms-serve.test.ts` 與其他 fixed-port listener test 平行執行造成 `CMS_LISTENER_UNAVAILABLE`；單獨執行通過。實際 `cms:serve` browser journey 通過：module assets、entry reload、Save、current preview、confirm Publish、published preview 與文章清單 published status 均為成功回應。
