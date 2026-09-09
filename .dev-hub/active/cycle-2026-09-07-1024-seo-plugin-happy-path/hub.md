---
id: cycle-2026-09-07-1024-seo-plugin-happy-path
status: active
created_at: 2026-09-07T10:24:29+08:00
updated_at: 2026-09-09T15:58:57+08:00
---

# SEO Plugin Happy Path

## Goal

依序完成 GitHub #307 SEO contract 與 GitHub #308 第一個真實 SEO Plugin、CMS authoring 及 published static build。

## Scope

WG-001 只核准 `contracts/README.md` 的跨 owner 契約，先合併並關閉 #307；WG-002 依已合併契約完成 runtime、測試、文件與 production browser/build flow，最後維持 #308 可審查。

## Context

目前 base worktree 有使用者未提交工作，兩個 Work Group 一律在獨立 worktree 執行。WG-002 依賴 WG-001 的 #307 merge/close，期間保持 blocked，不 stack runtime 實作。
