---
id: WI-067
status: done
title: Taxonomy service dedup 與 CMS taxonomy 表格 browser gate
work_group: WG-034
depends_on: ["WI-057", "WI-066"]
---

# Taxonomy service dedup 與 CMS taxonomy 表格 browser gate

## Outcome

移除 `core/taxonomy/service.ts` 內 `snapshot`／`impact`／`term` closure 與 module-level `commandResult`／`collectImpact` 的重複實作，改由單一 module-level materialization 提供；同時補上 [PR #354](https://github.com/wahengchang/ai-study-note/pull/354) 未涵蓋的 CMS taxonomy 表格 render 路徑。

## Acceptance

Taxonomy 對外行為（snapshot bytes、state digest、failure code、usage impact 排序）完全不變，由既有 Taxonomy／Persistence／Projection 測試證明。新增 real `startCmsRuntime` Chromium journey 以既有 taxonomy 進入 `/cms/taxonomies`，驗證非空 catalog 表格的排序與欄位，並在 detail 驗證 term 表格的 order 排序與 live／retired 狀態文字。不新增 lifecycle command UI、entry selector、route 或 contract 變更。

## Notes

PR #353／#354 合併後審閱發現：`TaxonomyList` 的表格分支與 `TaxonomyDetail` 的 term 表格分支（含 `使用中`／`已停用` 對應）在既有 browser gate 中完全未被執行；`core/taxonomy/service.ts` 的重複實作已於三份工作紀錄中順延。本 Work Item 一併結清。
