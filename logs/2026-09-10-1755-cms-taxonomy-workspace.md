# WI-057：CMS taxonomy administration workspace

- **完成時間**：2026-09-10T17:55:03+08:00
- **狀態**：completed

## 交付

- 新增 `/cms/taxonomies`、`/cms/taxonomies/new`、`/cms/taxonomies/:taxonomyId` 的 taxonomy list、create、detail UI 與 production nav。
- 以既有 Authoring API 的 taxonomy catalog/create/detail endpoints 完成操作；未直接存取 Taxonomy、Persistence 或 current catalog fallback。
- CMS document admission 與 central logger 新增三條 exact taxonomy routes；未知、encoded、nested 與 trailing-slash variants 延續 fail-closed。
- detail 顯示既有 term 的 label、slug、order、live/retired state；不新增 lifecycle command UI、entry selector 或歷史路由。

## 關鍵決策

- Issue #316 僅要求 list/create/detail flow，故不把既有 term lifecycle command transport 擴張成 UI；維持最小可用 administration surface。
- 以既有 Content Type workspace 的 loading、empty、safe error、retry、label／error association、live status 與 focus patterns 實作，不另建 UI framework。

## 實際驗證

- `npm run typecheck`、`npm run cms:build`、`npm run check:architecture`、`git diff --check` 通過。
- `node --import tsx --test-concurrency=1 --test tests/apps/cms/runtime-browser-gate.test.ts`：5/5 通過；新增 real `startCmsRuntime` authenticated Chromium journey，以鍵盤導覽 list → empty → create → detail，驗證 landmarks、skip/focus、labels、成功狀態與 mobile layout。

## 已知限制／後續

- 本機 pinned Chromium 已由 `npx playwright install chromium` 可用；CI／新開發環境仍需將安裝命令納入其啟動程序，避免 browser gate 無 binary。
- `core/taxonomy/service.ts` 重複實作仍依優先序併入下一個 Taxonomy core 修改。

## 相關 Branch／PR

- Branch：`feature/cms-taxonomy-workspace`
- PR：尚未建立
