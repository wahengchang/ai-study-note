---
id: WG-005
status: completed
title: 全新安裝的 current-only CMS 收斂
work_items: [WI-004, WI-006, WI-007, WI-009]
owner: domain_application_engineer
branch: codex/cms-core-data-reset
worktree: /Users/wahengchang/.codex/worktrees/cms-core-data-reset/ai-study-note
pr: null
---

## Delivery

- 依 2026-10-07 Owner 決定，以單一 PR 完成 taxonomy、entry media、search 與舊 lifecycle 清理；WI-008 因不遷移舊資料而取消。
- 全新安裝使用 current-only schema；舊 SQLite／媒體資料在寫入前拒絕，不自動刪除或覆寫。
- 依賴舊 Revision 的 Preview、site build、Release 入口暫停；Renderer／Delivery 的獨立 artifact 能力保留。

## Verification

- `npm run check`：typecheck、architecture、CMS build 與 202 項測試全過；其中 Chromium fresh-runtime journey涵蓋 Builder、taxonomy、media、draft/published Save、search/page 20、引用移除與 Delete。
- `npm run check:ai-sync`、`npm run dev-hub:overview:check`、`git diff --check` 通過。
- 舊 SQLite／媒體與 symlink、stale digest、無效關聯、被引用媒體與已移除 route／method 均有零部分寫入或 fail-closed 驗證；`site:build` 明確暫停。
- 非 owner 雙重交叉審查：Application／Authoring API／CMS reviewer 接受；Persistence reviewer 接受 current-only public factory 與 fresh-only admission，指出的 locale sort 已改為沿用 validated code-unit 順序。內部 store 尚有不可由公開 factory 取得的舊 SQL helper，留待後續內部清理。
