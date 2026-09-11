# RestoreRevision transport

## 交付

- 加入 `POST /v1/entries/:entryId/restore` 的 exact `restore-revision-request/v1` authenticated transport。
- 成功回傳 strict `restore-revision-success/v1` current/provenance receipt，並保留 published pointer。
- Local authoring client 新增同一受驗證的 RestoreRevision command；DomainApplication media unavailable failure 可安全傳遞 RestoreAsset descriptors。

## 關鍵決策

- Restore request 使用獨立 4 KiB body limit，與 Publish 的小型 command profile 一致。
- server 僅將符合 strict authoring error schema 的 safe restore descriptor 放入 error response；不回傳 raw media state 或儲存原因。

## 驗證

- `npm run typecheck`
- `node --import tsx --test tests/apps/authoring-api/http-contract.test.ts`
- `npm run check:architecture`
- `git diff --check`

## 已知限制

- 無。
