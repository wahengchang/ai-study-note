# 媒體封存復原與 RestoreRevision

- **完成時間**：2026-08-31T17:54:00+08:00
- **Work Group**：WG-010
- **Branch**：`cms/archive-restore-asset`

## 交付

- DataMedia 新增單一 asset version 的封存、復原與 availability inspection public seam。
- local object store 驗證 root identity、directory mode／owner，並以 no-follow file descriptor 驗證 final object。
- DomainApplication 新增 RestoreRevision；從 immutable source 建立帶 `restoredFromRevisionId` 的新 current revision，保留 published pointer。

## 關鍵決策

- Media 維持獨立 structural Persistence port，不跨 owner import Persistence public entrypoint。
- RestoreRevision 在 write 前完成 schema、media、current claim 與 transaction-bound route replacement preflight。
- `RestoreAsset` 的 stage 釋放排在 canonical availability 寫入之前：host fault 只可能留下未完成的復原，不會留下「回報失敗但已 ready」的紀錄。
- object 的讀取與雜湊一律留在寫入交易之外，交易內只重驗 immutable evidence，避免整份 object I/O 持有 SQLite write lock。
- RestoreRevision 的失敗碼與 SaveRevision／PublishRevision 對齊：未知 source revision 為 `INVALID_RESTORE_REVISION_REQUEST`、current pointer 前進為 `CURRENT_REVISION_MISMATCH`、proposal 過期為 `STALE_ROUTE_PROPOSAL`。

## 實際驗證

- `npm run check`（typecheck、architecture checker、完整測試）：128/128 通過（base `site-reset` 為 120）。
- `node --import tsx --test tests/core/media/archive-restore-asset.test.ts`：5/5 通過，涵蓋 archive 只改 availability、active published reference 阻擋並保持 canonical digest 不變、missing bytes 的 required／mismatch／exact recovery、release fault 後不留 ready 紀錄、ordered restore descriptors。
- `node --import tsx --test tests/core/application/restore-revision.test.ts`：3/3 通過，涵蓋 published pin 保留與 content／reference 對應來源、archived＋missing media 的 `BLOCKED_ARCHIVED_MEDIA_RESTORE` 零 mutation 與復原後重試成功、malformed／未知 source request 拒絕。
- 迴歸確認：restore 重試與 release fault 兩項測試在修正前的實作上失敗，修正後通過。

## 已知限制／後續

- `getReadyAssetVersion` 每次解析都完整重讀並重新雜湊 object；64 MiB object 約 0.2 秒，`importLocal` 對同一份 bytes 會經過 5 次完整讀取與雜湊。是否以 DB 中的 immutable evidence 快取取代逐次驗證，屬 Owner 對「fail closed 嚴格度 vs. 解析成本」的取捨，未在本次變更。
- local object store 的 staging 寫入與 promote 皆未 fsync 檔案或目錄；crash 後可能出現 canonical `ready` 但 object bytes 未落盤。contract 已核准的 startup reconciliation 尚未實作，需獨立 Issue。
- `importLocal` 在 promote／verify 失敗時不會釋放 staged bytes，需靠尚未實作的 startup reconciliation 清理。
