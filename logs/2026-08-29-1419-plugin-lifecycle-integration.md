# Plugin lifecycle integration

- **Cycle**：`cycle-2026-08-28-1655-plugin-lifecycle-integration`
- **完成時間**：2026-08-29T14:19:40+08:00
- **狀態**：completed
- **Branch**：`cms/plugin-lifecycle-integration`
- **PR**：https://github.com/wahengchang/ai-study-note/pull/268

## 交付

- WI-001：exact-identity re-enable、drift latch、trusted-root evidence gate 與 CMS editor-block resolution。
- WI-002：SaveRevision validator one-shot snapshot、immutable replacement chain 與 sanitized diagnostic。
- WI-003：real PluginHost／Persistence／SiteDefinition／DataMedia Application composition，涵蓋 snapshot isolation、雙 digest、failure ownership 與 transaction rollback。

## 關鍵決策

Plugin validator 在第一個 canonical write 前於同一 transaction consume prepared snapshot；lifecycle `stateDigest` 與 activation `activePluginStateDigest` 分離，避免 activation 改變重寫 operation attribution。

## 實際驗證

- `node --import tsx --test tests/core/plugin-host/plugin-host.test.ts tests/core/application/save-revision-plugin-composition.test.ts tests/core/application/save-revision.test.ts tests/core/application/save-revision-failures.test.ts`：25 pass。
- `npm run check`：106 pass。
- `npm run check:ai-sync` 通過。
- `npm run dev-hub:overview && npm run dev-hub:overview:check && node --import tsx --test tests/scripts/render-dev-hub-overview.test.ts` 通過。

## 已知限制／後續

- `prepareSaveRevisionValidators` 偵測 active evidence drift 時 fail closed，但不像 `getActiveSnapshot` 一樣把 identity latch 進 `reactivationRequired`。因此 drift 是否需要 exact re-activation，取決於哪一個 API 先觀察到它。目前行為由測試「validator prepare verifies all evidence before imports」鎖定（`port.reads === 1`），統一 latch 語意需要另開 SSOT 決策。

## 後續修正（review follow-up）

- **交付**：`resolveCmsEditorBlock` 在拒絕 callback 回傳的 native promise 前先觀察其 rejection，與 `runPreparedSaveRevisionValidators` 的既有處理一致。修正前，editor-block callback 回傳 rejected promise 會讓 raw exception 以 unhandled rejection 逸出 sanitized diagnostic boundary，並在 Node 預設 `--unhandled-rejections=throw` 下終止 process。
- **交付**：`validateActiveEvidence` 移除只寫不讀的 `installedById` map 與 `ActiveEvidence` 型別，直接回傳已驗證的 `State`。
- **驗證**：於 `editor callback failures are sanitized...` 新增 `rejected` probe mode 與明確的 `unhandledRejection` 斷言；未套用修正時該測試以 `failureType: 'unhandledRejection'` 失敗，套用後通過。`npm run check` 106 pass、`npm run check:ai-sync`、`npm run dev-hub:overview{,:check}` 皆通過。
