---
id: WG-029
status: completed
title: CMS Content Type administration workspace
work_items: ["WI-055"]
owner: Main
branch: feature/cms-content-type-workspace
worktree: /Volumes/UGREEN 2TB /projects/ai-study-note-reset/.dev-hub/worktrees/cms-content-type-workspace
pr: null
---

# CMS Content Type administration workspace

## Delivery

以既有 Authoring API／Application seam 實作 Content Type catalog、initial version 建立與 detail/history CMS route；完成後才將入口加入 production navigation。

## Verification

`npm run check` 於 2026-09-10 通過：TypeScript、architecture check、production CMS build 與 253 tests。審閱修正後 `npm run typecheck && npm run cms:build && node --import tsx --test-concurrency=1 --test tests/apps/cms/runtime-browser-gate.test.ts` 通過；三個實際 `startCmsRuntime`／Chromium journey 驗證 canonical route、empty/create/detail-history、heading focus、skip link、鍵盤提交、欄位級 label/error association、375px 無水平溢位，以及 immutable note@1/@2 history 的 current/digest/schema 同 snapshot 邊界。
