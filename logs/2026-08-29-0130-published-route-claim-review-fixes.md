# Published Route Claim 複審修正紀錄

- **Cycle**：`cycle-2026-08-28-2245-published-route-claim`（PR #263 複審追加）
- **完成時間**：2026-08-29T01:30:00+08:00
- **狀態**：completed

## 交付

- `SiteDefinition` canonical snapshot 的 claim 排序由 `localeCompare(…, "en")` 改為 code-unit 順序，使兩圖 snapshot bytes 與 digest 與 host locale／ICU 版本無關。
- `createCurrentClaim`／`createPublishedClaim` 的 commit 失敗不再一律壓成 `SITE_DEFINITION_STORAGE_FAILURE`；SiteDefinition 自有失敗（例如 baseline 在 prepare 與 commit 之間改變的 `STALE_ROUTE_PROPOSAL`）會原樣回傳，remediation 才會指向「重新取得 proposal」。
- `contracts/README.md` §5 明列 route-graph snapshot 的排序為 `{normalizedRoute, owner}` code-unit 順序。
- 新增兩個 published claim 測試：canonical 排序與 digest 可由公開表示重算；commit 期間 baseline 被插隊變更時回傳 `STALE_ROUTE_PROPOSAL`。

## 關鍵決策

- 排序改用 code-unit，與 `core/plugin-host/ordering.ts` 既有的 locale 無關排序慣例一致；snapshot digest 僅於讀取時計算、未落地儲存，因此不需 migration。
- `compareCodeUnits` 暫留在 `core/site-definition`，不跨 domain 匯入 `plugin-host`；是否上收至 `core/foundation` 留待後續。

## 實際驗證

- Node `22.22.2`／npm `10.9.7`（本機無 pinned `24.20.0`，以 `--engine-strict=false` 安裝依賴）：`npm run check`，typecheck、architecture checker 通過，82 tests passed。
- 兩個新增測試在修正前的 `service.ts` 上重跑確認為 failing（8 tests 中 2 failed），確認為真實 regression 而非同義測試。

## 已知限制／後續

- 驗證環境為 Node 22，非 `package.json` pinned 的 Node 24.20.0。
- `core/persistence/store.ts` 的 `canonicalState()` 與 `listRouteClaims()` 仍以 `localeCompare` 排序，`persistence-canonical-state/v1` digest 因此仍帶 locale 相依性；不屬本 PR 範圍，建議另開 Issue 收斂。

## 相關 Branch／PR

- Branch：`cms/published-route-claim`
- PR：[ #263 實作 published route claim 雙圖隔離](https://github.com/wahengchang/ai-study-note/pull/263)
