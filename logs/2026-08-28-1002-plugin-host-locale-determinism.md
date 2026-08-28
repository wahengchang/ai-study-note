# Plugin Host identity 的 locale determinism 修正

- 完成時間：2026-08-28T10:02:00+08:00
- 狀態：completed
- 起因：#247 的 review

## 交付

- 新增 `core/plugin-host/ordering.ts`，以 code-unit 比較取代 `String.prototype.localeCompare`。
- `manifest.ts` 的 normalization（capabilities／callbacks／resources）改用 code-unit 順序，manifest hash 因此不再隨 host process 的 locale 改變。
- `host.ts` 的 discovery 排序與 active identity 排序改用同一比較函式，寫入順序與 `activationState()` 讀取時強制的遞增不變式一致。
- `trusted-root.ts` 的 `installedPluginDirectories` 移除兩個分支結果相同的 dead code；containment 仍由 `resolvePluginDirectory` 在讀取 manifest 前強制。
- `host.ts` 改用 `manifest.ts` 匯出的 `isExactSemver`，移除重複的 semver 驗證與 `semver` import。
- 新增 `tests/core/plugin-host/locale-determinism.test.ts`：在目前 locale 驗證不變式，並以 `da_DK.UTF-8` child process 重跑同一份契約。

## 關鍵決策

- Plugin ID、hook 與 resource file 都是 canonical ASCII，因此比較規則固定為 code-unit 順序，不接受 collation。
- Regression test 以 child process 提供 locale，並移除繼承的 `NODE_TEST_CONTEXT`／`NODE_TEST_WORKER_ID`；否則巢狀 `--test` 會回報 exit code 0 而讓失敗被吞掉。

## 實際驗證

- Node `v24.20.0`、npm `11.19.0`。
- 修正前：`LC_ALL=da_DK.UTF-8` 下 activate `aa`、`ab` 後持久順序為 `["ab","aa"]`，`getActiveSnapshot()`／`deactivate()` 之後固定回傳 `ACTIVATION_STATE_FAILURE`；同一份 manifest bytes 的 manifest hash 也與 `en-US` 不同。
- 新測試在修正前失敗、修正後通過。
- `npm run check`：typecheck、architecture 與 51 tests 通過。
- `npm run check:ai-sync`：通過。

## 已知限制／後續

- `activate()` 會先跑完整 discovery、再重讀目標 manifest，目標 manifest 每次 activation 被讀取與解析兩次。
- `discovery()` 的重複 ID 統計與 `PLUGIN_IDENTITY_CONFLICT` rejection 目前不可達：manifest 驗證要求 `id` 等於唯一的目錄名稱，因此同一 root 內不可能出現重複 ID。保留為 defensive check。
- digest 驗證與 `import()` 之間仍有 TOCTOU 窗口；屬於既有 trusted-local capability boundary 的限制，非 process sandbox。

## 相關 Branch／PR

- Branch：`cms/plugin-host-220`
- PR：https://github.com/wahengchang/ai-study-note/pull/247
