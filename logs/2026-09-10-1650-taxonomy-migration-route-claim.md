# PR #348 審閱：Taxonomy migration route claim 修正

- **完成時間**：2026-09-10T16:50:00+08:00
- **狀態**：completed

## 交付

- 修正 `migrate-bindings`：搬動 current／published pointer 後，於同一 transaction 內把對應 graph 的 route claim 一併改指 replacement Revision，normalized route 不變。
- 被搬動的 pointer 若在該 graph 找不到可跟隨的 claim，整筆 migration 以 `TAXONOMY_MAPPING_UNRESOLVABLE` fail closed、零寫入。
- 既有 migration 測試補上兩個 graph 的 route claim fixture 與 claim 跟隨斷言；新增 claim 缺席的 fail-closed 測試。
- 同步更新 `contracts/README.md` migration 條款與 `docs/INDEX.md` Taxonomy 欄位。

## 關鍵決策

- Route claim 屬於 Persistence，Taxonomy 透過既有 `listRouteClaims`／`replaceRouteClaim` 直接操作，不引入 SiteDefinition 依賴，維持 contract 的「Taxonomy 只可依賴 Persistence 與 Foundation」。
- claim 缺席選擇 fail closed 而非略過：真實 entry 每次 save／publish 都會建立 claim，缺席代表 unresolvable state，靜默略過只會留下同樣壞掉的 published projection。

## 實際驗證

修正前後以同一支 end-to-end probe A/B 對照：修正前 migration 後 `readCurrentEntry` 由 OK 變成 `SAVE_REVISION_FAILED`，兩個 graph 的 claim 仍停在舊 `sourceRevisionId`；修正後 claim 跟隨 pointer、`readCurrentEntry` 維持 OK。`npm run typecheck`、`npm run check:architecture` 通過；`tests/core/**` 204 tests 與 extensions／CLI／HTTP contract 30 tests 全數通過。8 個 Playwright browser test 在本容器因缺少 pinned headless shell 而失敗，與本次變更無關（修改前後失敗集合相同）。

## 已知限制／後續

- `retire-term` 只檢查 current／published usage，因此僅被歷史 Revision 綁定的 term 可被 retire；之後 RestoreRevision／media replacement 會沿用該 binding 而在 `createRevisionTaxonomyBindings` 的 live 檢查失敗，變成無診斷的 `RESTORE_REVISION_FAILED`。
- `rename-term` 造成的 evidence drift 會讓帶有該 term 未映射 binding 的 Revision 永久無法 `migrate-bindings`，且回報 `TAXONOMY_MAPPING_UNRESOLVABLE`，remediation 訊息與真實原因不符。
- CMS `save()` 固定送 `taxonomyTerms: []`，在 term selector 完成前，任何 CMS 儲存都會讓新 current Revision 失去既有 taxonomy bindings。
- `core/taxonomy/service.ts` 的 `impact` closure 與 `collectImpact`、`snapshot` closure 與 `commandResult` 內聯區塊為重複實作，可合併。

## 相關 Branch／PR

- Branch：`feature/taxonomy-administration`
- PR：https://github.com/wahengchang/ai-study-note/pull/348
