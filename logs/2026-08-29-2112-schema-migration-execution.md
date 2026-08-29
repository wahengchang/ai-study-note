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

- execution 先 consume issuer evidence，再在唯一 `BEGIN IMMEDIATE` transaction 重新驗證 plan freshness、next schema version、replacement identities 和 operation ID；任何失敗回滾整個 write-set。

## 實際驗證

- `node --import tsx --test tests/core/persistence/schema-migration-impact.test.ts tests/core/persistence/schema-migration-execution.test.ts tests/core/persistence/migration-runner.test.ts`：11 pass。
- `node --import tsx --test "tests/core/persistence/*.test.ts"`：21 pass。
- `npm run check`：94 pass。

## 已知限制／後續

無。

## 相關 Branch／PR

- Branch：`cms/schema-migration-execution`
- PR：尚未建立。
