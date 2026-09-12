# Content Type migration contract hardening

## 交付

- #282 的 migration Application boundary 改為 exact、fail-closed DTO parsing；foreign、extra、duplicate、accessor、symbol、non-enumerable 與 prototype 異常輸入均在 Persistence 前拒絕。
- schema-version collision 映射為既有 `CONTENT_TYPE_MIGRATION_STALE` HTTP 409。
- transport outcome 移除 migration nested `z.unknown()`；blocked migration 以 strict `content-type-migration-blocked/v1` 422 error envelope 回傳 exact impact。
- fixed-origin listener regression 覆蓋 nonempty preview/execution、blocked、foreign mapping、collision 與 admission rejection。

## 關鍵決策

- 沿用 `CONTENT_TYPE_MIGRATION_STALE` 而非增加新的 public conflict code：target next-version 已被占用代表 preview evidence 已過期，仍是既有 409 stale contract。
- 保留 Persistence execution transaction；該邊界已由 non-owner integrity reviewer 確認為原子 rollback 邊界，沒有新增第二套 transaction。

## 驗證

- `npm run typecheck`
- `node --import tsx --test tests/core/application/content-type-migration.test.ts tests/apps/authoring-api/http-contract.test.ts`：34/34 通過。
- `npm run check:architecture`
- `cms_workspace_engineer` 與 `data_media_engineer` 責任的兩個非 owner reviewer 最終複審皆 ACCEPT。

## 限制／後續

- 依 Owner 指示，不合併本次後續 PR；#282 於 PR 建立後維持 open，等待明確合併指示。
