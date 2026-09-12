---
id: WI-070
status: done
title: Content Type migration contract hardening
work_group: WG-051
depends_on: ["WI-042"]
---

# Content Type migration contract hardening

## Outcome

補齊 [GitHub Issue #282](https://github.com/wahengchang/ai-study-note/issues/282) 剩餘的 Application 與 Authoring API contract gaps。

## Acceptance

- 直接 Application 呼叫對 proposal／command 及所有 nested row 採 exact、fail-closed 驗證，拒絕不改變 canonical state。
- schema-version collision 統一回傳既有 `CONTENT_TYPE_MIGRATION_STALE`，HTTP 為 409。
- migration outcome 不含 `z.unknown()`；blocked outcome 為 strict、可解析的 422 safe error envelope。
- fixed-origin actual listener 覆蓋 strict DTO、blocked、stale/collision 與 admission rejection，且拒絕不呼叫 migration facade、不改變 canonical state。
- 兩個 migration route 完整重演 #282 的 transport security acceptance：valid、missing、malformed、duplicate、invalid、old、revoked key，evil Host／Origin／forwarded 與 OPTIONS，404／405／415／400／503 mapping，且 response 與 log 無 `asn_v1_`／`asn_bt_v1_` canary。

## Notes

- 維持 `content-type-migration/v1`；不新增 mapper script、callback 或 registry selector。

## Completed

- Application direct DTO 與 HTTP transport output 都改為 exact、fail-closed contract。
- `SCHEMA_VERSION_CONFLICT` 轉為既有 stale 409，不另增 public error code。
- migration route 的 admission/security proof 比照既有 Media route 逐 route 矩陣，未新增 runtime 行為。
- 兩個非 owner reviewer 複審通過。
