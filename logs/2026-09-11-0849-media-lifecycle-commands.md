# Media lifecycle commands

## 交付

- 新增 Media detail、version replacement、archive、restore 的 Application-only Authoring API routes。
- `POST /v1/media/:assetId/versions` 使用 strict `media-version-replacement-request/v1`，先做 pointer/reference preflight，再建立 immutable replacement version，最後委派既有 SaveRevision replacement seam。
- 成功回 strict `media-version-replacement-receipt/v1`；第二 durable phase 失敗回 `MEDIA_VERSION_CREATED_REPLACEMENT_FAILED`，保留已驗證的 ready version。

## 關鍵決策

- version import 與 revision replacement 不是單一 storage transaction。已知 preflight rejection 在 import 前返回；第二階段衝突／fault 不回滾 immutable ready version，且不移動 current/published pointer。
- CMS Media workspace 不在本 work group 範圍。

## 驗證

- `npm run typecheck`
- `npm run check:architecture`
- `git diff --check`
- `node --import tsx --test tests/core/media/archive-restore-asset.test.ts tests/core/application/save-revision-media-replacement.test.ts`
- `node --import tsx --test --test-name-pattern='imports and lists' tests/apps/authoring-api/http-contract.test.ts`

## 已知限制

- `/cms/media` 及相關 CMS workspace 仍由 WI-058 交付。
