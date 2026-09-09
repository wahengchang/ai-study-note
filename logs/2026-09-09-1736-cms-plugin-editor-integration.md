---
cycle: cycle-2026-08-29-1002-cms-issue-backlog
work_item: WI-062
work_group: WG-023
completed_at: 2026-09-09T17:36:54+08:00
status: completed
pr: https://github.com/wahengchang/ai-study-note/pull/334
---

# CMS plugin editor integration

## 交付

- 將 `PluginHost.resolveCmsEditorBlock()` 的 source identity 收斂為 revision 可完整持久化的 `{id,version,hook,manifestHash}` binding，Host 仍自行驗證 manifest、capability 與 durable active evidence。
- 新增 `DomainApplication.resolveCurrentCmsEditorBlocks()` 與 authenticated finite `GET /v1/entries/:entryId/current/editor-blocks`；回傳 strict `cms-editor-block-resolutions/v1`，active 輸出與 inactive／missing／identity-changed 的 Host diagnostic 都由 current canonical source 導出。
- Entry editor 保留完整 canonical interactive block；Host output／diagnostic 僅顯示，不進 SaveRevision payload。interactive block 具 keyboard-focusable output/source region、live status 與具名 diagnostic note。
- 新增 Application、Authoring API 與 authenticated CMS Chromium/a11y browser gate；browser 斷言 active output、三個 safe state、keyboard focus 與 Save 的 source-preservation invariant。

## 關鍵決策

- 不擴充 exact `authoring-entry/v1`；使用獨立 resolution DTO，避免把 derived Host output 混入 canonical current document。
- CMS 只呼叫 Authoring API；不 import installed Plugin module、verified entry bytes 或 callback export。

## 實際驗證

- `node --import tsx --test tests/core/plugin-host/plugin-host.test.ts tests/core/application/cms-editor-block-resolutions.test.ts`：18 passed。
- `npm run cms:build && node --import tsx --test tests/apps/cms/plugin-editor-blocks.test.ts`：authenticated Chromium browser/a11y gate passed。
- `node --import tsx --test tests/apps/authoring-api/http-contract.test.ts`：17 passed。
- `npm run check`：typecheck、architecture check、CMS build 與 242 tests 全數通過。

## 追加修正（PR review）

Review 發現 CMS 端採用 `cms-editor-block-resolutions/v1` 時缺三道 guard，均已修正於 `apps/cms/workspace.tsx`：

- **Stale response 跨文章汙染**：`refreshEditorBlocks()` 只比對自己 closure 裡的 `entry`，切換文章時前一篇尚未回來的 response 仍會通過自身比對並寫入 state，把 A 篇的 Host output 貼到 B 篇的 block 上。改為沿用 SEO 既有的 generation ref（`editorBlockGeneration` 於 `adopt()` 遞增），比 adopt 更早發出的 response 一律丟棄。
- **Response 未驗證 snapshot 完整性**：Editor 以 block index 對齊 resolution，但先前未檢查 `blockIndex` 序列是否等於 document 的 interactive block 位置，也未檢查各 item 是否同源。`DomainApplication.resolveCurrentCmsEditorBlocks()` 是逐 block 呼叫 Host，中途的 activation 變更會讓同一份 response 混到兩個 `activeStateDigest`。改為 index 序列與單一 `activeStateDigest` 皆須成立，否則落到既有的「互動區塊狀態已變更，請重新載入文章。」。
- **失敗訊息被重複播報**：`EditorPluginBlock` 逐 block 渲染 `role="alert"`，一份含 N 個 interactive block 的 document 會讓同一則訊息被 AT 播報 N 次。alert 改由 Editor 統一渲染一次；per-block status text 維持不變。

## 已知限制／後續

- `GET /v1/entries/:entryId/current/editor-blocks` 對非 `site-content/v1` 的 entry 會回 `CMS_EDITOR_BLOCK_RESOLUTIONS_FAILED`（500）。CMS 不會走到（`adopt()` 先擋下），但直接呼叫 API 時 500 語意上代表 Application fault，與「entry 本身健康、只是不是 site-content」不符。
- `refreshPreviews()` 同樣沒有 stale-response 保護（PR 之前既有行為，未在此變更）。
