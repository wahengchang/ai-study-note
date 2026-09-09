---
id: cycle-2026-09-09-2116-seo-308-contract-closeout
status: active
created_at: 2026-09-09T21:16:12+08:00
updated_at: 2026-09-09T21:29:35+08:00
---

# SEO-308 Contract Closeout

## Goal
修正已進入 `site-reset` 的 SEO vertical slice 所遺留的五項 #308 contract gap，並以 current `site-reset` 建立唯一的修正 PR。

## Scope
schema evidence migration reconciliation、SEO analysis current baseline／canonical URL admission、canonical public site URL settings admission，以及 `indexing` 至 public contribution／renderer robots 的完整傳遞。

## Context
PR #331 已由 site-reset 合併的 #332 取代並關閉；#331 沒有可安全擷取的獨有修正。交叉審查確認五項 gap 都存在於 current `site-reset`，因此必須在此分支精準修正，不可重併過時分支。

所有 Work Item 已完成；待建立 Work Group PR 後依流程寫入完成 log 並刪除 Cycle。