# Media library import

## 交付

- DataMedia 增加安全 catalog/detail projection；從 Persistence 與 local object storage 的前後 snapshot 驗證讀取一致性，metadata bytes/value、raw media、stage/final path 與 import ID 都不進 DTO。
- `GET /v1/media` 與 `POST /v1/media/import` 經既有 fixed-origin、Bearer、strict JSON 與 response schema gate 交付。import 僅在 ready commit 後回傳 detail，base64url 採 canonical decode，並限制 4 MiB request、4,128,768 encoded characters、3,096,576 decoded bytes 與 64 KiB envelope。
- pending import ID 先行拒絕；stage collision 只在 durable pending 已存在時轉成 `MEDIA_IMPORT_CONFLICT`。startup reconciliation error 不再暴露 import ID 或 storage key。

## 關鍵決策

- PR #359 的 contract amendment 保留既有 `staged → pending` durable lifecycle；不以新的 reservation table 取代它。競態 stage collision 會安全映射為 409，且不寫 canonical state。
- CMS Media workspace 和 `/v1/media/:assetId` lifecycle routes 留給後續 stacked Work Group，未提前公開。

## 驗證

- `npm run typecheck`
- `npm run check:architecture`
- `git diff --check`
- `node --import tsx --test tests/core/media/local-import.test.ts`
- `node --import tsx --test --test-name-pattern='imports and lists' tests/apps/authoring-api/http-contract.test.ts`

## 已知限制／後續

- WI-047 交付 detail lifecycle routes（create version/archive/restore）；WI-058 才交付 CMS Media workspace。
