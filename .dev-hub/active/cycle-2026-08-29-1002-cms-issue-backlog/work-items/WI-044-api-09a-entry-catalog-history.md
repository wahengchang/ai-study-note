---
id: WI-044
status: done
title: Entry catalog/read history
work_group: WG-024
depends_on: []
---

# Entry catalog/read history

## Outcome
完成 [GitHub Issue #284](https://github.com/wahengchang/ai-study-note/issues/284) 的核准結果。

## Acceptance
Issue body 的 public seam、fail-closed 與 proof 均通過；未滿足依賴前不得建立 Work Group。

## Notes

GitHub #284；`listEntries()`／`getEntry()`／`listEntryRevisions()` 與 `GET /v1/entries`、`GET /v1/entries/:entryId`、`GET /v1/entries/:entryId/revisions` 已在 `site-reset` 交付；history document 不帶 route claim，僅 current／published selection 帶 normalized route。實作來自 #332／#334，不是 #337。
