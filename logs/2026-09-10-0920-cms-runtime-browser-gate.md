---
cycle: cycle-2026-08-29-1002-cms-issue-backlog
work_group: WG-027
completed_at: 2026-09-10T09:20:03+08:00
status: completed
---

# CMS authenticated runtime browser gate

## 交付

補齊 GitHub #315 的 production-composition browser proof。新增 authenticated Chromium journey，從空 SQLite 開始，使用 real migration、repository-external packaged `seo-basics` Plugin、durable active `study-notes` Theme、local credential server proof／browser ticket、`startCmsRuntime` fixed-origin listener 與 `dist/cms` built assets。

Journey 實際走 `/cms`、`/cms/entries`、`/cms/entries/new`、`/cms/entries/:entryId`，建立 Article v1、儲存、Current／Published preview、二段 Publish、Article v2 與 published-with-draft。它不攔截 HTTP、不手寫 browser session、Bearer 或 API response，也不預植 entry／revision／pointer。

## 關鍵決策

保留原本 `article-workspace.test.ts` 的 transport fixture test；它快速鎖住純 UI interaction。新增獨立 test 才能同時證明 production composition、credential admission、fixed-origin document/API router、Persistence、active Theme preview 與 built assets。fixed port 是 contract，因此在 user 停止既有 demo listener 後，以 test-concurrency=1 執行，不改用 ephemeral listener 規避。

## 實際驗證

- `npm run check`：typecheck、architecture check、CMS production build 與 252 tests 全數通過。
- `tests/apps/cms/runtime-browser-gate.test.ts`：真實 fixed-origin Chromium journey 驗證四條 route pathname、session bootstrap、heading focus／skip link／named main、iframe content 與 `sandbox=""`、tab wrap、dialog 開啟／Escape／status focus、375px 實際 Save 與無水平 overflow。

## 已知限制／後續

發布對話框雙向 focus wrap 與確認前 published pointer 不變尚未由這次 assertion 精確證明；追蹤於 `WI-065`。

## 相關 Branch／PR

- `feature/cms-runtime-browser-gate`
- https://github.com/wahengchang/ai-study-note/pull/343
