# Content Type migration

## 交付

- `content-type-migration/v1` 以完整 replacement JSON 預覽與執行同一 schemaId 的下一版。
- SQLite migration 在單一 transaction 內保留 taxonomy evidence，並將已移動 pointer 的 route claim 一併移轉。
- Authoring API 提供 `POST /v1/content-types/:schemaId/migrations/preview` 與 `POST /v1/content-types/:schemaId/migrations`；兩路由均受既有認證、body 限制與 response contract 保護。

## 關鍵決策

- mapping identity 取 proposal 的 canonical JSON digest；執行須帶相同 state digest 與明確 operationId，避免 stale report 寫入。
- migration 的 source Revision 一律以完整 replacement 表示；缺少、重複或無效 mapping 失敗封閉，canonical state 不變。

## 驗證

- `npm run typecheck`
- `node --import tsx --test tests/core/persistence/schema-migration-execution.test.ts`：6/6
- `node --import tsx --test tests/apps/authoring-api/http-contract.test.ts`：27/27；包含實際 listener 的 preview 與 execution。

## 已知限制

- 無。
