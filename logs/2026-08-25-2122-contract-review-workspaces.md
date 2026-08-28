# API 與資料庫契約審核工作區塊規劃

- **交付**：建立兩個 q-plan active work hub：`.dev-hub/active/api-contract-review/hub.md` 與 `.dev-hub/active/database-contract-review/hub.md`。兩者都列出現況、決策、可執行 milestones/increments、風險、最終驗證與 handoff。
- **關鍵決策**：API 的發行單位是既有 `api.md` 與 `openapi.json`，由 `architecture_engineer` 擁有，`cms_engineer`、`database_engineer` 交叉審核。資料庫的發行單位是 `database.md`、migration、generated schema、fixture 與 verifier，由 `database_engineer` 擁有，`architecture_engineer`、`cms_engineer` 交叉審核。所有指定角色不得為 `DISAGREE`；每個 `NEEDS_REVISION` 必須修正並重審為 `ACCEPT`。
- **實際驗證**：`node docs/architecture/2026-08-25-1758-sql-cms/verify-contract.mjs` 通過 migration/schema、SQLite constraints、OpenAPI matrix 與 mutation resistance。`git check-ignore` 確認 `.dev-hub/active/` 兩個 work hub 均由 `.gitignore` 忽略。
- **限制／後續**：本次只完成可執行工作區塊與深度規劃，尚未凍結候選版、啟動 Codex 角色審核或發行任何文件；依各 hub 的 M1 開始執行。

## 後續執行結果

- **交付**：API candidate `api-contract-2026-08-25-07` 與 Database candidate `database-contract-2026-08-25-07` 均已完成指定 Codex 角色的 owner 與交叉審核，並在各 active hub 標記為 `discussion_reviewed`。
- **文件定位**：依使用者指示，`docs/` 是討論結果與審核輸入，不是 source of truth；兩個 hub 的通過狀態僅表示討論候選的內部一致性與角色審核通過，不裁定系統決策。
- **資料庫加強**：新增 append-only `0002_contract_integrity.sql` 與 `0003_route_pointer_alignment.sql`，重建 `schema.sql`，並擴充 fixture/verifier 的 monotonic resource version、pointer owner、route source、idempotency/operation-log 與 media retention 證據。
- **Route final state**：commit-final route pointer/source alignment 由未來 `RouteMigrationService` 在同一 transaction 的最後一個 database operation 驗證；SQLite 僅負責 immediate constraints。RouteMigrationService 尚未實作，rollback integration tests 是未來實作 gate。
- **最終驗證**：`node docs/architecture/2026-08-25-1758-sql-cms/verify-contract.mjs` 通過：migration/schema、SQLite constraints、typed OpenAPI invariants 與 mutation resistance。
