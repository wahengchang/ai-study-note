# SEO Plugin Happy Path 交接

## 目前狀態

- #307 contract 已完成：PR [#313](https://github.com/wahengchang/ai-study-note/pull/313) 已 merged，Issue #307 已 closed。
- #308 在 `feature/seo-basics-happy-path` 獨立 worktree；所有 #308 變更仍未提交，尚未建立 PR。
- 核准計畫的唯一執行依據：`local://seo-plugin-happy-path-plan.md`；已合併的 boundary 在 `contracts/README.md`。

## 已落地的部分

- Content：`ContentReadModel` clean-cutover、required `StructuredContent.seo`、fixtures explicit `seo:{}`。
- Persistence：`0009` Theme activation 與 `0010` Plugin settings singleton migration、state read/CAS、canonical-state extension arrays/counts。
- PluginHost：SEO hooks/capabilities、activation identity required capabilities、required `settingsState`、CMS SEO/public snapshot slice、activation/deactivation required expected activation digest。
- Application：Save nullable baseline、Content read dependency、current-entry／CMS SEO analysis／settings facade 與對應初始 tests。

## 恢復順序

1. **先修復編譯。** 最後中斷時已在 `core/plugin-host/host.ts` 加入 `getActivationManagementSnapshot()`，但其 `PluginActivationManagementSnapshot` type import 尚未補入。接著執行 `npx tsc --noEmit`，處理同一輪暴露的 Host/Application 合約不一致；尤其核對 `validatePublicBuildSnapshot()` 的 contract return type。
2. 完成 PluginHost management snapshot 的 direct test 與 `core/plugin-host/index.ts` export，讓 Application 能正確映射 `inactive`／`active`／`reactivation-required`。
3. 完成 Application 的全部 SaveRevision caller migration；`apps/authoring-api/transport-contracts.ts` 與 `tests/apps/authoring-api/save-revision-cli.test.ts` 仍需加入 `expectedCurrentRevisionId`。
4. 依計畫依序實作 Authoring API、CMS/Vite、seo-basics/Theme package、Projection、Renderer/Delivery、CLI，最後才執行完整 targeted tests、`cms:build`、`npm run check`、browser/build/omission smoke。

## 已驗證

下列結果是在最後一次未完成的 Host management snapshot edit **之前**取得：

- `tests/core/content/structured-read-model.test.ts`：5/5。
- `tests/core/persistence/migration-runner.test.ts`：4/4。
- `tests/core/plugin-host/plugin-host.test.ts tests/core/plugin-host/locale-determinism.test.ts`：19/19。
- Application scoped tests：`tests/core/application/seo-authoring.test.ts tests/core/application/save-revision.test.ts`：3/3。
- 當時 `git diff --check` 與 `npx tsc --noEmit` 曾通過；恢復後必須重新執行，不能沿用此證據。

## 注意

- 不得 reset、stash、或改動 base dirty worktree 的使用者檔案。
- 不得提交、推送或開 #308 PR，直到 plan step 25 的完整 runtime/tests/docs 與 step 26 verification 完成。
- 本檔是交接快照，不是 contract；實作行為仍以程式與測試為 SSOT。
