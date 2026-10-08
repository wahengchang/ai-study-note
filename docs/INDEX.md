# AI Study Note Reset 文件導覽

程式碼與對應測試是已實作行為的 SSOT；[implementation contract](../contracts/README.md) 固定核准範圍。[CMS Core/Data reset 規格](../specs/cms-core-data-reset.md) 說明本輪資料模型與驗收。[Dev Hub workflow](dev-hub-workflow.md) 說明大型工作的 PR 與 Cycle 收尾。

## 現行 CMS：全新安裝與新內容

| 任務 | 程式入口 | 驗證 |
| --- | --- | --- |
| 全新安裝、拒絕舊 SQLite／媒體、重複 `cms:init` | [migration runner](../core/persistence/migrations.ts)、[current-only SQL](../db/migrations/0001-create-current-only-storage.sql)、[CMS launcher](../apps/authoring-api/cms-local-cli.ts) | [migration test](../tests/core/persistence/migration-runner.test.ts)、[launcher test](../tests/apps/cli/cms-local-cli.test.ts) |
| Content Type、custom fields、Article seed | [Application](../core/application/content-type-administration.ts)、[Persistence](../core/persistence/index.ts) | [Content Type test](../tests/core/application/content-type-administration.test.ts) |
| current taxonomy、term hierarchy、entry binding | [taxonomy administration](../core/application/current-taxonomy-administration.ts)、[entry administration](../core/application/entry-administration.ts) | [taxonomy test](../tests/core/application/current-taxonomy-administration.test.ts)、[entry test](../tests/core/application/entry-administration.test.ts) |
| current media、featured／custom media usage、streaming upload | [media library](../core/application/current-media-library.ts)、[object store](../core/media/current-object-store.ts) | [media test](../tests/core/application/current-media-library.test.ts)、[persistence test](../tests/core/persistence/current-media-assets.test.ts) |
| 本機 HTTP 與 CMS browser 操作 | [Authoring API](../apps/authoring-api/server.ts)、[CMS workspace](../apps/cms/workspace.tsx) | [完整 API／Playwright journey](../tests/apps/authoring-api/current-only-journey.test.ts) |
| 架構與完整驗證 | [architecture checker](../scripts/check-architecture.ts)、[package scripts](../package.json) | `npm run check`、`npm run check:ai-sync` |

`npm run cms:init` 只接受全新或本版 current-only runtime。舊資料不遷移、不刪除；需另存原目錄。`npm run cms:start` 提供新內容的編輯資料流。Preview、`site:build`、Release 尚未接上新資料；`site:build` 明確回 `CURRENT_CONTENT_PUBLIC_BUILD_PAUSED`。Renderer、Delivery 與 Public UI 的獨立 artifact 能力保留，後續 PR 才接上新內容的公開站流程。

## 其他獨立模組

| 模組 | 現行入口 | 測試 |
| --- | --- | --- |
| Foundation、canonical JSON、digest | [public entry](../core/foundation/index.ts) | [Foundation tests](../tests/core/foundation/) |
| Plugin Host、Theme Host | [Plugin Host](../core/plugin-host/index.ts)、[Theme Host](../core/theme-host/index.ts) | [Plugin tests](../tests/core/plugin-host/)、[Theme tests](../tests/core/theme-host/) |
| Renderer、Delivery、Public UI | [Renderer](../core/renderer/index.ts)、[Delivery](../core/delivery/index.ts)、[Public UI](../apps/public-ui/index.ts) | [Renderer tests](../tests/core/renderer/)、[Delivery tests](../tests/core/delivery/)、[Public UI tests](../tests/apps/public-ui/) |

歷史的 Revision／Version、Preview、Release 與 schema migration 規格仍留在 [舊工作包](../specs/cms-basic-contracts-v1/) 供追溯；它們不再是 CMS authoring 入口。新公開站接線請從 [current-only contract](../contracts/README.md) 和現行 source 開始。

## 維護規則

- 行為、邊界、資料流、公開介面或維運程序改變時，同步更新相關文件與鄰近流程註解。
- 根目錄 `AGENTS.md`、`CLAUDE.md` 與代理技能目錄是 Rulesync 生成輸出；只修改 [canonical 規則](../.rulesync/rules/) 或 [技能來源](../.rulesync/skills/)，再執行 `npm run sync:ai` 與 `npm run check:ai-sync`。
- 長期 Owner 決策放入 [ADR](adr/README.md)；Dev Hub active state 與 [logs](../logs/) 記錄工作進度和完成摘要，不取代 contract。
