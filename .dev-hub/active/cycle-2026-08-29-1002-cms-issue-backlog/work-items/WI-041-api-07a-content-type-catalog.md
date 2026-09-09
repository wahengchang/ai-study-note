---
id: WI-041
status: done
title: Content Type catalog 與 initial version
work_group: WG-024
depends_on: []
---

# Content Type catalog 與 initial version

## Outcome
完成 [GitHub Issue #281](https://github.com/wahengchang/ai-study-note/issues/281) 的核准結果。

## Acceptance
Issue body 的 public seam、fail-closed 與 proof 均通過；未滿足依賴前不得建立 Work Group。

## Notes

GitHub #281；`createContentTypeAdministration().createInitial()` 與 `GET /v1/content-types`、`GET /v1/content-types/:schemaId`、`POST /v1/content-types` 已在 `site-reset` 交付，`tests/apps/authoring-api/http-contract.test.ts` 覆蓋 admission 與 fail-closed。實作來自 #332／#334，不是 #337。
