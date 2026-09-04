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

## 已知限制／後續

- 無；Renderer／Delivery／Preview HTTP 維持各自後續 Work Item。

## 相關 Branch／PR

- Branch：`cms/projection-preview`
- PR：建立後寫入 `WG-016`。
