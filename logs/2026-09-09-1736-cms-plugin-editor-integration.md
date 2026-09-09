---
cycle: cycle-2026-08-29-1002-cms-issue-backlog
work_item: WI-062
work_group: WG-023
completed_at: 2026-09-09T17:36:54+08:00
status: completed
branch: feat/cms-plugin-editor-integration
pr: null
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

## 已知限制／後續

無。
