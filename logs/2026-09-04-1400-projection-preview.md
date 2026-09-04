# Projection & Preview 交付紀錄

- **Cycle**：`cycle-2026-08-29-1002-cms-issue-backlog`
- **完成時間**：2026-09-04T14:00:02+08:00
- **狀態**：completed
- **Work Item／Group**：`WI-028`／`WG-016`

## 交付

- Persistence capability-safe `runReadSnapshot()` 與 SiteDefinition transaction-bound route snapshot。
- DataMedia verified exact object bytes、Plugin zero-mutation inspection、Theme manifest parser public seam。
- `core/projection/index.ts`：published-only `renderer-input/v1`、single-subject current/published Preview 與 canonical parser。

## 關鍵決策

- Projection 不建立 Renderer、Delivery、HTTP 或 CLI；只輸出 immutable canonical bytes。
- external evidence materialization 前後以 selection guard 檢查，不 retry。

## 實際驗證

- Node `v24.20.0`／npm `11.19.0`。
- `node --import tsx --test tests/core/persistence/read-snapshot.test.ts tests/core/site-definition/read-snapshot.test.ts`：4/4 通過。
- `node --import tsx --test tests/core/media/verified-object-read.test.ts`：1/1 通過。
- `node --import tsx --test tests/core/plugin-host/plugin-host.test.ts`：16/16 通過。
- `node --import tsx --test tests/core/theme-host/theme-host.test.ts`：9/9 通過。
- `node --import tsx --test tests/core/projection/preview-isolation.test.ts`：1/1 通過。
- `npm run typecheck`、`npm run check:architecture`、`npm run check`：通過；全套 `187/187` 通過。
- 複審收斂後 `npm run check` 重跑通過；全套 `190/190` 通過。

## 複審收斂（2026-09-04）

- `capture()` 原本把 read snapshot 內產生的 Projection failure 全部改寫成 `PROJECTION_STORAGE_FAILURE`，使 `SUBJECT_NOT_FOUND`、`UNRESOLVED_ROUTE_REFERENCE` 等診斷與 `subjectIds` 無法傳到 caller；改為只改寫 `PersistenceFailure`。current 模式缺少 current pointer 也改回報 `SUBJECT_NOT_FOUND`。
- `renderer-input/v1` 的 `routeGraphDigest` 原本在 guard 之外另外讀一次 route graph，claims 與 digest 可能來自兩個 canonical state；改由 snapshot A 的同一次 route 讀取取得，同時省下一次 route 讀取與 canonical 編碼。
- `parseRendererInput`／`parsePreviewInput` 原本只檢查 top-level key 與自洽 digest 便 cast 成型別；由於 digest 只由 payload 自身推導、無法認證來源，任何 canonical document 都能冒充。改為完整結構驗證並重算所有 evidence digest，Theme manifest 重用 `parseThemeManifest` seam、route 重用 `normalizeRoute`、Plugin identity 重用 `validatePluginActivationIdentity`。
- 共用的 `exact`／`freeze`／`equalBytes` 與 `mediaSelectionDigest`／`routeSelectionDigest` 收斂到 `core/projection/canonical.ts`，producer 與 parser 由同一份定義推導，`exact` 也不再對敵意 proxy 拋出。
- 新增 `tests/core/projection/strict-parse.test.ts`：capture 診斷、含 media 的 producer round-trip，以及 12 種重新簽章後的竄改 payload 全數被拒。

## 已知限制／後續

- 無；Renderer／Delivery／Preview HTTP 維持各自後續 Work Item。

## 相關 Branch／PR

- Branch：`cms/projection-preview`
- PR：建立後寫入 `WG-016`。
