# Schema migration execution

- **完成時間**：2026-08-29T21:12:25+08:00
- **Cycle**：`cycle-2026-08-29-1002-cms-issue-backlog`
- **Work Group**：`WG-003-schema-migration-execution`
- **Work Item**：`WI-016`／GitHub #230

## 交付

- target schema 在 preflight 僅作 canonical、copied proposal；成功 execution 才 append schema history。
- issuer-bound evidence 封存 target proposal、validated mapped bytes、pointer policies 與 scoped freshness digest；execution 僅接受 evidence、operation ID 與 replacement identities。
- 新增 `0008-add-schema-migration-lineage.sql`：execution header、revision source→replacement、pointer move/pin lineage 與 immutable triggers。
- 新增 deterministic reopen query 與 `persistence-canonical-state/v2` lineage collections/counts。

## 關鍵決策

- execution 在唯一 `BEGIN IMMEDIATE` transaction 內重新驗證 plan freshness、next schema version、replacement identities 和 operation ID；任何失敗回滾整個 write-set。
- evidence 只在「已 commit 的 execution」後失效。被拒絕或回滾的嘗試沒有寫入任何 row，若先 consume 再驗證請求，呼叫端會因為一個 typo 就得重跑整個 preflight（含 mapper／validator）。單次 commit 的保證由 evidence 失效與 in-transaction freshness 檢查共同維持。
- 輸入形狀守衛抽為 `core/persistence/record-shape.ts`：preflight 與 execution 共用同一份規則，frozen／immutable 請求物件在兩邊都必須被接受。

## 實際驗證

- `node --import tsx --test tests/core/persistence/schema-migration-execution.test.ts`：5 pass（含 blocked report 拒絕、frozen 請求、evidence 生命週期、media reference 複製與 pin entry 不變）。
- `node --import tsx --test "tests/core/persistence/*.test.ts"`：24 pass。
- `npm run check`：97 pass。

## 已知限制／後續

- execution 只有 persistence 介面，尚未有 application command 或 CLI 入口；pointer policy 與 replacement identity 仍由呼叫端決定。
- `asset_version_availability` 目前只會是 `ready`；canonical state 已恢復涵蓋 availability，但 archive／restore 路徑尚未實作。

## 相關 Branch／PR

- Branch：`cms/schema-migration-execution`
- PR：https://github.com/wahengchang/ai-study-note/pull/272
