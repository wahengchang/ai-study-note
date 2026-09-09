---
id: WG-024
status: completed
title: Article／read seam 交付歸屬與 PR #337 取代紀錄
work_items: ["WI-035", "WI-041", "WI-044", "WI-049"]
owner: Main
branch: chore/pr-337-supersession-record
worktree: .dev-hub/worktrees/pr-337-supersession-record
pr: https://github.com/wahengchang/ai-study-note/pull/339
---

# Article／read seam 交付歸屬與 PR #337 取代紀錄

## Delivery

本 Work Group 不新增 runtime 程式碼，只修正交付歸屬：WI-035／WI-041／WI-044／WI-049 的 seam 已在
`site-reset` 上由 #332（`feature/site-reset-seo-basics`）交付、#334（`feat/cms-plugin-editor-integration`）延伸，
但四個 Work Item 一直停在 `pending`／`work_group: null`。此處將它們標記為 `done` 並在各自 `Notes` 指向
`site-reset` 上真正的實作與測試入口。

`site-reset` 的 Article workspace 雖已有 save、preview 與 publish workflow，卻沒有 #315 acceptance 要求的
`/cms/entries` 明確 history route；WI-056 必須維持 `pending`，不納入本 Work Group。

平行分支 `feat/article-workspace-runtime`（PR #337）重做上述既有 seam，且其 `/v1/*` Origin 檢查較寬
（POST 亦允許省略 `Origin`），而 `site-reset` 只對 GET／HEAD 放行。決策：關閉 #337、保留
`site-reset` 的既有實作與本紀錄作為 provenance；這不構成 #315 已完成的宣告。詳見
`logs/2026-09-09-2130-pr-337-supersession.md`。

## Verification

2026-09-09：本變更只動 `.dev-hub/` 與 `logs/` markdown。讀取 `site-reset` 的
`apps/cms/workspace.tsx` route table，確認目前只有 `/cms`、`/cms/entries/new`、
`/cms/entries/:entryId`，缺少 `/cms/entries`；`apps/authoring-api/server.ts` 已允許該
history document。故移除 WI-056 的錯誤完成宣告，不以既有測試代替 #315 的四條 route browser/a11y gate。
