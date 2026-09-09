---
id: WI-035
status: done
title: DomainApplication｜Authoring read facade 與 immutable DTOs
work_group: WG-024
depends_on: ["WI-015"]
---

# DomainApplication｜Authoring read facade 與 immutable DTOs

## Outcome
完成 [GitHub Issue #275](https://github.com/wahengchang/ai-study-note/issues/275) 的核准結果。

## Acceptance
Issue body 的 public seam、fail-closed 與 proof 均通過；未滿足依賴前不得建立 Work Group。

## Notes

GitHub #275；seam 已在 `site-reset` 由 `core/application/authoring-read.ts` 的 `createAuthoringReadFacade()` 交付（defensive-copy DTO、canonical state digest 前後一致才回傳，否則 `AUTHORING_READ_STATE_STALE`）。實作來自 #332 並由 #334 延伸，不是 #337。
