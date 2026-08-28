# Save Revision Review Fixes

- **完成時間**：2026-08-28T12:05:00+08:00
- **狀態**：completed

## 交付

針對 PR #248（`cms/save-revision-foundation`）的審查回饋，修正四個正確性問題並補上對應測試。

- `DomainApplication.saveRevision` 不再把 transaction 內偵測到的 failure 收斂成 `SAVE_REVISION_FAILED`；`ROUTE_CONFLICT`、`STALE_ROUTE_PROPOSAL`、`MEDIA_UNAVAILABLE` 會帶著原本的 `owner` 與 `subjectIds` 回傳給呼叫端。
- `saveRevision` 改在同一 transaction 內讀取 entry pointers，移除保存 `publishedRevisionId` 時的 read-then-write 空窗。
- Persistence 區分「寫入失敗」與「唯讀查詢的 not-found」：只有前者會強制回滾外層 transaction。
- 本機 media promotion 在退回 `copyFileSync` 時把 `EEXIST` 視為既有 object，與 `linkSync` 路徑一致。

## 關鍵決策

- **唯讀查詢不污染 transaction**：原本 `createOperations` 對任何 Persistence-owned failure 都記錄 `firstFailure` 並強制回滾，連呼叫端刻意處理的 `ENTRY_POINTER_NOT_FOUND` 也一樣。這使得 transaction 內無法做「可能查無資料」的讀取，也正是 `saveRevision` 當初把 pointer 讀取移到 transaction 外的原因。改為只有寫入路徑（`failed`）記錄失敗，唯讀路徑（`refused`）不記錄；唯讀查詢不會寫入任何 row，因此不可能留下部分寫入。
- **還原 constraint 對應**：`store.ts` 改寫時遺失了 `CONSTRAINT_VIOLATION` → `SCHEMA_VERSION_CONFLICT`／`REVISION_CONFLICT` 的對應，改以 `guarded` 的 `onConstraint` 參數還原。
- **移除 `as unknown as` 雙重轉型**：`PersistenceTransaction` 本來就結構相容於 `SiteDefinitionTransaction`，雙重轉型只是關掉型別檢查。

## 實際驗證

- `npm run check`（typecheck + architecture + 62 個測試全數通過）
- `npm run check:ai-sync`
- 新增的 7 個測試中，有 4 個在套用修正前會失敗（`MEDIA_UNAVAILABLE`、`STALE_ROUTE_PROPOSAL`、schema not found、transaction 內 read-miss），修正後通過。

## 已知限制／後續

- `core/persistence/store.ts` 在本 PR 的改寫中被壓縮成大量超長單行（50 行超過 160 字元），與 repository 其餘程式碼風格不一致。本次只整理了實際修改到的區段，完整重排留待後續獨立處理，以免混淆審查 diff。
- `MediaObjectStore` 的 staging path 只由 `importId` 決定，同一 `importId` 以不同 bytes 重試會停在 `MEDIA_STAGING_FAILURE`，需等 startup reconciliation（contracts §38）落地後才會自行復原。

## 相關 Branch／PR

- Branch：`cms/save-revision-foundation`
- PR：https://github.com/wahengchang/ai-study-note/pull/248
