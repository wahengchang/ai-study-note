---
id: WG-027
status: completed
title: CMS authenticated runtime browser gate
work_items: ["WI-064"]
owner: Main
branch: feature/cms-runtime-browser-gate
worktree: /Volumes/UGREEN 2TB /projects/ai-study-note-reset/.dev-hub/worktrees/cms-runtime-browser-gate
pr: null
---

# CMS authenticated runtime browser gate

## Delivery

以 production CMS runtime 組成測試取代 transport fixture 的 browser-only proof，覆蓋 GitHub #315 既有四條 route 和 a11y journey，不變更 production domain seam。

## Verification

`npm run check` 於 2026-09-10 通過：typecheck、architecture check、CMS production build 與 252 tests。獨立 test 以 real `startCmsRuntime` fixed listener、SQLite、durable active packaged Theme、credential proof/ticket/session 與 built CMS assets 驅動 Chromium，驗證四條 canonical route、Preview、Publish、published-with-draft、a11y focus/tab/dialog 與 375px。
