# ADR：Content Type migration 採 strict replacement transport

- **日期：** 2026-09-12
- **狀態：** 已接受
- **相關：** [Content Type migration contract](../../contracts/README.md)、[Taxonomy、transport 與 Backlog 收斂](../../logs/2026-09-10-2026-09-13-finalization.md)

## 決策背景

不相容 schema migration 必須能讓操作者審核每個 pointer 的處置，同時不允許 script、patch 或模糊 mapping 在 transport 邊界混入 canonical write。

## 決策

`content-type-migration/v1` 使用每個 source Revision 的完整 replacement JSON；request 指定 source version，target 是同 schema ID 的下一版。preview/execution 都綁 fresh impact evidence，partial 或 invalid mapping 以 strict、可消費的 HTTP 422 outcome 回報；已佔用的 next version 視為 stale evidence，回既有 409 conflict/stale outcome。

## 後果

- Application 與 HTTP parser 都必須驗證 pointer policy、mapping 與 nested impact element，不可用 `unknown` 承接 owner record。
- execution 保持既有 Persistence transaction；不得增加第二套 transaction 或在 transport 直接寫入。
- admission rejection、malformed/foreign input、stale/blocked outcome 均不得呼叫 migration command 或改變 canonical state。
