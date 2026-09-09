---
id: WG-025
status: completed
title: CMS article entry workspace
work_items: ["WI-056"]
owner: Main
branch: feature/cms-article-workspace
worktree: /Volumes/UGREEN 2TB /projects/ai-study-note-reset
pr: https://github.com/wahengchang/ai-study-note/pull/341
---

# CMS article entry workspace

## Delivery

實作 GitHub Issue #315 的 article-first 文章管理垂直切片：將 `/cms` 定義為行動導向首頁，新增明確的 `/cms/entries` history route，保留並驗證新增、編輯、預覽與二段發布流程。流程只能經既有 CMS API client 與已核准的 Authoring API seam；不新增 `/cms/preview` 或任何 build／release／deploy 路徑。

## Verification

2026-09-09：`npm run cms:build && node --import tsx --test tests/apps/cms/article-workspace.test.ts tests/apps/authoring-api/cms-browser-bootstrap.test.ts tests/apps/authoring-api/http-contract.test.ts`（20 passed）；`npm run check`（typecheck、architecture check、CMS production build 與 251 tests 全數通過）。browser gate 實際驗證四條 canonical routes、skip link/landmarks、Current／Published keyboard tabs、sandboxed iframe、dialog Escape/取消焦點回復、發布成功 status focus、以及 375px 窄螢幕操作。
