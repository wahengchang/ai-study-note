---
id: WG-015
status: completed
title: Theme Host 可信 identity 與驗證 host
work_items: ["WI-027"]
owner: Main
branch: cms/theme-host
worktree: .dev-hub/worktrees/theme-host
pr: https://github.com/wahengchang/ai-study-note/pull/304
---

# Theme Host 可信 identity 與驗證 host

## Delivery

以 `origin/site-reset` 為 base，完成 Theme Host v1 的公開 seam、repository-external evidence validation、self-contained runtime import-graph scan 與對應 architecture checker／contract tests；不執行 Theme runtime，不建立 activation、callback 或 Renderer/CMS UI。

## Verification

`node --import tsx --test tests/core/theme-host/theme-host.test.ts tests/core/foundation/check-architecture.test.ts`：28/28 通過。`npm run typecheck && npm run check:architecture` 通過。`npm run check`：175/175 通過。實際 runtime 為 Node `v22.22.0`／npm `10.9.4`，與 contract Node `24.20.0`／npm `11.19.0` 不同；完整紀錄見 `logs/2026-09-04-1050-theme-host.md`。

複審後補強：`resolveExact`／`readVerifiedFile` 改為只驗證被選中 package 的 evidence，`discover` 不再保留 package bytes，並補上四個原本沒有 fixture 的 failure code 測試。以 contract 指定的 Node `24.20.0`／npm `11.19.0` 重跑 `npm run check`：180/180 通過；完整紀錄見 `logs/2026-09-04-1210-theme-host-review.md`。
