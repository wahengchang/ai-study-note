# WI-066：CMS taxonomy binding preservation

- **完成時間**：2026-09-10T17:46:37+08:00
- **狀態**：completed

## 交付

- CMS 成功載入既有 entry 時，從 `AuthoringEntryV1.current.taxonomyBindings` 投影 defensive-copy 的 exact `{taxonomyId,termId}`，並隨 SaveRevision 原樣送出。
- 新文章維持空 taxonomy identity array；CMS 不回送 immutable evidence／digest、不讀取 current catalog，亦未新增 selector、nav 或 document route。
- 成功 reload 才原子替換 document、CAS baseline 與 taxonomy identities，並解除 conflict lock；409 不會讓過期 editor 再次寫入舊 identities。
- 新增 real `startCmsRuntime` Chromium journey：seed 含 Alpha binding 的 entry、外部以 Beta binding 製造 CAS conflict、CMS reload 後儲存並發布，最後由 Persistence 驗證 current／published revisions 都保留同一份 Beta immutable evidence 與 digest。

## 關鍵決策

- 維持 Authoring API／Application／Taxonomy 既有嚴格 identity admission、CAS 和 transaction materialization，不擴張 public boundary。空陣列是有效 SaveRevision contract，資料遺失只能在 CMS source 修正。
- 只保存 identity，不保存 evidence。immutable evidence 的唯一 materialization 仍在 Taxonomy transaction，維持 fail-closed 與禁止 current catalog fallback 的 ADR／contract。

## 實際驗證

- `npm run typecheck` 通過。
- `npm run cms:build` 通過。
- `npm run check:architecture` 通過。
- `git diff --check` 通過。
- `node --import tsx --test-concurrency=1 --test tests/apps/cms/runtime-browser-gate.test.ts`：4/4 real Chromium browser/a11y journeys 通過。
- 以 `npx playwright install chromium` 恢復本機 pinned Chromium 後執行上述 browser gate。

## 已知限制／後續

- WI-057／#316 必須在 WI-066 合併後開始，且仍需先將 Playwright browser installation 固化到 CI／開發環境；本次只恢復目前工作站的 pinned Chromium，未變更 CI 設定。
- `core/taxonomy/service.ts` 的重複實作依既有優先序併入下一個 Taxonomy core 修改。

## 相關 Branch／PR

- Branch：`fix/cms-taxonomy-binding-preservation`
- PR：https://github.com/wahengchang/ai-study-note/pull/353
