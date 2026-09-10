# WI-055 CMS Content Type administration workspace

- **Cycle**：`cycle-2026-08-29-1002-cms-issue-backlog`
- **完成時間**：2026-09-10T10:23:34+08:00
- **狀態**：completed

## 交付

- 實作 `/cms/content-types` catalog、`/cms/content-types/new` immutable initial version 建立，及 `/cms/content-types/:schemaId` current schema detail／catalog-derived version history。
- Content Type 互動僅透過既有 authenticated Authoring API；CMS 未直接存取 Persistence 或新增 transport seam。
- 三條 route 實作後才將 Content Type 加入 production CMS nav；同步記錄 finite API 與 document allowlist。

## 關鍵決策

- detail 與 history 皆由同一份 `GET /v1/content-types` catalog snapshot 導出：先依 schema ID 篩選 immutable versions，再選最新版做 current document；不擴張 API，也不混合不同 read snapshot。
- production empty outcome 使用沒有 reconciled `site-content` evidence 的已 migration runtime database，保留真實 `startCmsRuntime` composition，避免既有 baseline schema 掩蓋空 catalog。

## 實際驗證

`npm run check` 通過：TypeScript、architecture check、production CMS build 與 253 tests。審閱修正後 `npm run typecheck && npm run cms:build && node --import tsx --test-concurrency=1 --test tests/apps/cms/runtime-browser-gate.test.ts` 通過；三個真實 `startCmsRuntime`／Chromium journey 覆蓋三條 canonical route、empty/create/detail-history、heading focus、skip link、鍵盤操作、欄位級 label/error association、375px 無水平溢位，以及 immutable note@1/@2 history 的排序、唯一 current、v2 digest/schema 與 v1 保留。

## 已知限制／後續

無。

## 相關 Branch／PR

- Branch：`feature/cms-content-type-workspace`
- PR：尚未建立（將由 WG-029 追蹤收尾 commit 寫入）。
