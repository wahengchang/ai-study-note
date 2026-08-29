# Schema migration impact preflight

- **Cycle**：`cycle-2026-08-29-1002-cms-issue-backlog`
- **完成時間**：2026-08-29T16:41:57+08:00
- **狀態**：completed
- **Branch**：`cms/schema-migration-impact`
- **PR**：建立前為 `null`；Work Group 追蹤收尾時寫回唯一 PR URL。

## 交付

- Persistence public seam 新增 `preflightSchemaMigration` 與 issuer-bound opaque evidence 驗證。
- 唯讀 SQLite snapshot 產生去敏 impact report；coverage 包含 current／published pointers、retained source revisions、move-only mapping 與 deterministic blockers。
- mapper／validator callback 採複本、封閉 record 與同步結果驗證；任何 fault、thenable、Proxy、non-canonical output 或 stale snapshot 都 fail closed。
- 新增 public SQLite contract tests，並在文件導覽連結新的 impact preflight seam。

## 關鍵決策

以同一 issuing `PersistenceStore` 的 `WeakMap` 保存 private scoped digest；公開 report 只保留不可偽造的 frozen opaque token，不序列化 content、schema、digest、SQL 或 callback cause。

## 實際驗證

- `node --import tsx --test tests/core/persistence/schema-migration-impact.test.ts`：3 pass。
- `node --import tsx --test "tests/core/persistence/*.test.ts"`：17 pass。
- `npm run check`：typecheck、architecture checker 與 109 tests 通過。
- `.dev-hub/overview/` 在 execution base 不存在；未重建歷史 projection，因此 overview renderer 三項驗證不適用。

## 已知限制／後續

- WI-016／#230 的 replacement revision 寫入與 pointer move/pin execution 不在本 Work Group 範圍。
