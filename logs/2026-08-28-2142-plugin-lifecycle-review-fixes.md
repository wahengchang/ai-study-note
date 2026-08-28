# Plugin lifecycle integration 覆審修正

- **來源**：PR #259（`cms/plugin-lifecycle-integration`）覆審
- **完成時間**：2026-08-28T21:42:31+08:00
- **狀態**：completed

## 交付

- `getActiveSnapshot` 與 `prepareSaveRevisionValidators` 在使用 installed evidence 前重新比對 exact identity，不一致時回傳 `ACTIVE_PLUGIN_IDENTITY_MISMATCH`。
- 新增 `evidenceIdentity()` helper，`activate`／`resolveCmsEditorBlock`／`getActiveSnapshot`／`prepareSaveRevisionValidators` 共用同一組 installed identity 推導，移除既有兩處 non-null assertion。
- `Host` 的 prepared validator snapshot 由 `Map<symbol, Prepared>` 改為以 token 物件為 key 的 `WeakMap`。
- 新增 regression test：active 狀態下就地改寫 manifest 造成 identity drift 的行為。

## 關鍵決策

- identity drift 視為 `ACTIVE_PLUGIN_IDENTITY_MISMATCH`（既有但先前未被產生的 failure code），而非 `ACTIVE_PLUGIN_SOURCE_MISSING`；後者保留給 installed source 不可用。
- prepared snapshot 仍維持 single-use（consume 後 `delete`）；WeakMap 只負責讓未 consume 的 snapshot 可回收，不改變 token 語意。

## 實際驗證

- 修正前以臨時 probe 確認：active 期間將 manifest 就地升級為 `1.0.1` 後，`getActiveSnapshot` 仍回報舊的 `1.0.0` identity 為 ok，且 `prepareSaveRevisionValidators` 會載入漂移後的 entry bytes。
- 新增的 regression test 在修正前的 `host.ts` 上失敗（`# fail 1`），修正後通過。
- prepared snapshot 保留量：300,000 次未 consume 的 prepare，GC 後 heap 由 +76.0 MB 降為 +0.3 MB。
- `npm run check`：63/63 通過（typecheck、check:architecture、test）。
- `npm run check:ai-sync`：通過。

## 已知限制／後續

- `PLUGIN_VALIDATION_SERVICE_FAILED` 與 `PLUGIN_NOT_FOUND` 仍是未被任何路徑產生的 failure code；schema validator 在 plugin replacement 階段拋錯時，目前經由 transaction rollback 收斂成 `SAVE_REVISION_FAILED`。
- `resolveCmsEditorBlock` 對 active 且 identity 相符的 Plugin 一律回傳 `PLUGIN_CAPABILITY_DENIED`，`CmsEditorBlockResolution` 的 `active` 分支尚無產生路徑（與 `05-plugin-host-core.md` 的實作 surface 說明一致）。
- 尚無「validator callback 實際成功執行並替換內容」的端對端測試；`extensions/plugins/activation-probe` 的 hook 目前一律拋錯。

## 相關 Branch／PR

- Branch：`cms/plugin-lifecycle-integration`
- PR：https://github.com/wahengchang/ai-study-note/pull/259
