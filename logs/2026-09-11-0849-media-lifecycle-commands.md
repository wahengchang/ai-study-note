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

## 審查後修正（2026-09-11）

- `MEDIA_RESTORE_REQUIRED`／`MEDIA_RESTORE_MISMATCH` 原本落到 `[500]` 預設分類；已依契約歸入 422。
- `MEDIA_ARCHIVE_BLOCKED_PUBLISHED` 的 `archiveImpact` 與 `MEDIA_RESTORE_REQUIRED` 的 `restoreCommands`
  原本在 Application／transport 邊界被丟棄；現在以契約指定的 `media-archive-blocked/v1` 與
  `media-restore-required/v1` DTO 投影，evidence 不符 strict schema 時退回同 status 的 redacted
  `authoring-error/v1`，不以 generic 500 抹掉安全的 Media error。
- 未知 asset 的 detail 讀取原本回 `MEDIA_READ_FAILED`（503）；新增 `MEDIA_ASSET_NOT_FOUND` 並依契約回 404。
- `POST /v1/media/:assetId/restore` 原本缺 encoded bytes 與 64 KiB non-bytes envelope 上限；三個
  bytes-carrying route 現在共用同一組上限，oversize 一律為 `REQUEST_BODY_TOO_LARGE`。

### 追加驗證

- `npm run typecheck`
- `npm run check:architecture`
- `node --import tsx --test tests/apps/authoring-api/http-contract.test.ts`
- `node --import tsx --test tests/core/media/*.test.ts tests/core/application/*.test.ts`

## 已知限制

- `/cms/media` 及相關 CMS workspace 仍由 WI-058 交付。
- version replacement 第二階段的 CAS 衝突目前一律回 `MEDIA_VERSION_CREATED_REPLACEMENT_FAILED`（500），
  尚未依契約的「stale current 或 replacement conflict 409」細分；已驗證的 ready version 不受影響。
