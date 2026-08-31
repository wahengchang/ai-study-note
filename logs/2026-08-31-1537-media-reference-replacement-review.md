# Media reference replacement review hardening

- **Cycle**：`cycle-2026-08-29-1002-cms-issue-backlog`
- **Work Group**：`WG-009-media-reference-replacement`
- **完成時間**：2026-08-31T15:37:00+08:00
- **狀態**：completed

## 交付

- 修正 replacement path 的 current-route claim 選取：`PublishRevision` 已有的「claim 找不到就重讀 pointer」保護抽為共用 `selectCurrentClaim`，兩個命令共用。current pointer 在 pointer 讀取與 route snapshot 之間前進時，回傳可恢復的 `CURRENT_REVISION_MISMATCH`／`Content`，不再回傳不可行動的 `SAVE_REVISION_FAILED`／`SiteDefinition`。
- 新增 `MEDIA_REFERENCE_CONFLICT` failure code：source revision 已引用 replacement asset version 時，derived reference set 會重複。原本落到 `INVALID_SAVE_REVISION_REQUEST`（空 subjectIds、要求呼叫端「修正 request」），但 request 本身合法且無法藉修改 request 解除；現在明確指名衝突的 asset version 並由 `DataMedia` 擁有。
- `MEDIA_UNAVAILABLE` preflight 的 subjectIds 只列出實際無法解析的 asset version，不再把整組引用的健康 asset 一併列為 remediation 對象；`SaveRevision` 與 `PublishRevision` 共用同一個 `mediaUnavailable` helper。

## 關鍵決策

- 三項都是既有 preflight 的診斷正確性問題，不改變任何成功路徑或 write-set；replacement 的重複引用選擇 fail closed 而非靜默去重，以免默默改變 revision 的引用數量。
- `selectCurrentClaim` 一併回傳 snapshot digest，讓 `PublishRevision` 的 proposal baseline staleness 檢查維持綁定同一份 snapshot，不因抽取共用而放鬆。

## 實際驗證

- `node --import tsx --test tests/core/application/save-revision-media-replacement.test.ts`：4 pass；三項新增／收緊的斷言在修正前的程式碼上確實失敗（3 fail / 1 pass），確認為真實 regression 覆蓋。
- `npm run check`：typecheck、architecture check 通過，120 pass。

## 已知限制／後續

- `DataMedia.requireReadyAssetVersions` 仍以 `MEDIA_VERSION_UNAVAILABLE` 與空 subjectIds 回報，無法指出是哪一個 version；application 層以逐一 `getReadyAssetVersion` 在失敗路徑補齊 subject。若後續要在 DataMedia 內回報精確 subject，可移除此補償。

## Branch／PR

- Branch：`cms/media-reference-replacement`
- PR：https://github.com/wahengchang/ai-study-note/pull/296
