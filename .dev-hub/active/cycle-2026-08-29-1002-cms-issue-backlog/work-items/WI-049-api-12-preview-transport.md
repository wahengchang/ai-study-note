---
id: WI-049
status: done
title: Preview transport
work_group: WG-024
depends_on: []
---

# Preview transport

## Outcome
完成 [GitHub Issue #289](https://github.com/wahengchang/ai-study-note/issues/289) 的核准結果。

## Acceptance
Issue body 的 public seam、fail-closed 與 proof 均通過；未滿足依賴前不得建立 Work Group。

## Notes

GitHub #289；`POST /v1/preview` 已在 `site-reset` 交付，只回 server-rendered `preview-document/v1`，`http-contract.test.ts` 覆蓋 current／published 與 fail-closed。實作來自 #332／#334，不是 #337。
