# WI-067：Taxonomy service dedup 與 CMS taxonomy 表格 browser gate

- **完成時間**：2026-09-10T18:13:05+08:00
- **狀態**：completed

## 交付

- `core/taxonomy/service.ts` 的 taxonomy snapshot 與 usage impact 各自收斂為單一 module-level 實作：新增 `taxonomySnapshot`、`taxonomyTermRecord`，`commandResult` 改為組合 `taxonomySnapshot`，`createTaxonomy` 內的 `snapshot`／`impact`／`term` closure 全數移除。
- `prepareMigration` 不再注入 `getTerm`／`getImpact`／`fail`，直接呼叫同一份 module-level helper；`createTaxonomy` 的 `fail` 改為指向既有 `taxonomyFailure`。淨減 46 行，無對外行為變更。
- `tests/apps/cms/runtime-browser-gate.test.ts` 新增 real `startCmsRuntime` Chromium journey，覆蓋 PR #354 未執行到的兩條 render 路徑：非空 taxonomy catalog 表格，以及 detail 的 term 表格。

## 關鍵決策

- 這是純 dedup：snapshot bytes、state digest、failure code 與 usage impact 排序都由既有 Taxonomy／Persistence／Projection 測試鎖住，因此不新增 core 測試，改以既有測試全綠證明行為不變。
- 新增 gate 直接斷言整列表格文字（`allInnerTexts()`）而非個別欄位，讓 catalog 的 taxonomyId code unit 排序、term 的 `order` 排序與 `live`／`retired` 對應到 `使用中`／`已停用` 同時成為 SSOT。
- seed 刻意先建立排序在後的 `topics` 與 order 較大的 `beta`，證明畫面順序來自 Taxonomy 的 canonical 排序而非建立順序。

## 實際驗證

- `npm run typecheck` 通過。
- `npm run cms:build` 通過。
- `npm run check:architecture` 通過。
- `git diff --check` 通過。
- `node --import tsx --test-concurrency=1 --test "tests/**/*.test.ts"`：264/264 通過，含 browser gate 6/6 與 Taxonomy core 5/5。

## 已知限制／後續

- 本次環境無法下載 pinned Playwright Chromium（proxy 阻擋），改以既有 Chromium build 經 `PLAYWRIGHT_BROWSERS_PATH` 執行 browser gate；未變更任何測試或 CI 設定。將 browser installation 固化到 CI／開發環境仍為既有後續項目。
- 審閱另發現 `TaxonomyDetail`／`ContentTypeDetail` 的 detail fetch 沒有 generation guard，理論上可在 detail 之間直接切換時 render 過期回應。目前 UI 沒有 detail 對 detail 的連結，未能證明可達路徑，因此本次不改；如日後新增 detail 間導覽需一併補上 Editor 既有的 generation 模式。

## 相關 Branch／PR

- Branch：`fix/cms-taxonomy-workspace-review`
- PR：https://github.com/wahengchang/ai-study-note/pull/355
