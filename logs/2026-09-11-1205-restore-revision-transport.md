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

## 審查後修正（2026-09-11）

- `credentialError()` 原本把非 revoked 的 credential-store 失敗從 `503 INTERNAL_SERVER_ERROR`
  改為 `401 AUTHORIZATION_INVALID`，影響全部 `/v1` route。契約 §7 固定「unsafe/corrupt store 回 503」
  且 status class 保留 `503 credential store`；這也會讓不安全／損壞的 store 與錯誤的 key 無法區分，
  操作者失去「請修復本機 credential store」的 remediation。已復原 503 並補上 HTTP 回歸測試。
- 本 PR 一併改寫既有 #308 finite route 條文，刪除「inability to form a DTO from
  storage/Application fault is 500」與「Central classification rejects unknown, trailing-slash,
  nested, encoded paths and OPTIONS」兩項已核准且已實作的約束，並把 `identity-changed` 改成與
  `core/plugin-host/host.ts` 不符的 `identity-change`。已復原。
- `docs/INDEX.md` 指向不存在的 `tests/apps/authoring-api/cms-session.test.ts`；改指實際存在的
  `cms-browser-bootstrap.test.ts`。

### 追加驗證

- `npm run typecheck`、`npm run check:architecture`、`npm run cms:build`
- `node --import tsx --test tests/apps/authoring-api/http-contract.test.ts`（22 passed）
- `node --import tsx --test tests/apps/authoring-api/credential-lifecycle.test.ts tests/apps/authoring-api/cms-browser-bootstrap.test.ts tests/apps/authoring-api/cms-serve.test.ts tests/apps/authoring-api/credential-cli.test.ts`

## 已知限制

- 無。
