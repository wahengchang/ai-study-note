# #219 Persistence 審查後強化紀錄

接續 `logs/2026-08-27-1639-persistence-219.md`。前一輪已修掉 clean checkout 紅燈、假 PRAGMA 與 unknown DB 判定；本輪處理 PR #242 審查中列為「未處理」的 API 衛生與韌性項目。

## 交付

- `PersistenceResult<T>` 不再沿用 `CoreResult<T>` 聯集。原本 caller 在 `!result.ok` 之後會拿到 `CoreFailure | PersistenceFailure`，被迫處理 `owner: "CoreFoundation"` 這種實作永不回傳的 failure。
- `store.ts` 的 transaction 早退改用 `TransactionAbort` sentinel throw。原本 conflict／not-found 路徑用 `return` 回傳 failure，交易會照常 COMMIT；目前所有早退都在任何 write 之前所以無正確性問題，但只要日後有人把 write 移到早退之前就會靜默留下半成品。
- failure 分類改用 SQLite extended result code（node:sqlite 的 `errcode`），不再解析英文 driver 訊息。新增 `sqliteConstraintKind()` 區分 unique／foreign-key／check／trigger，`store.ts` 因此只把「唯一性衝突」翻成 identity conflict，CHECK／FK 失敗照實回報。
- `shippedMigrationSources` 由 module top-level 常數改為 lazy function。原本讀檔失敗會在 import 期丟出未包裝例外、繞過整套 structured failure。
- 新增 `DATABASE_UNAVAILABLE`。原本目錄不存在／權限不足／檔案毀損全部回報成 `INVALID_DATABASE_PATH`（「請提供有效的 database path」），對 operator 是誤導；語法檢查失敗仍為 `INVALID_DATABASE_PATH`。
- `contracts/README.md` 的 Revision 形狀同步為 `schemaIdentity{schemaId, version}` 並補上 `lineage`。
- CLI contract test 改為直接從 `package.json` 解析 `db:migrate` 的 argv，而不是在測試裡另抄一份旗標。

## 關鍵決策

- 非本 owner 宣告的 trigger abort 維持 `STORAGE_FAILURE`，不因改用 result code 而升級成 `CONSTRAINT_VIOLATION`。本輪只換分類機制，不改 caller 看到的 failure code；`immutable_*` 兩個 trigger 名稱是本 owner 自己 RAISE 的固定字串，比對安全。
- `TransactionAbort` 沒有可觀測的行為差異（實測空交易 COMMIT 與 ROLLBACK 都不改變檔案 bytes），因此不另造 regression test；既有 conflict 測試仍鎖住 failure code，adapter 的 rollback 由既有 lineage canary 測試覆蓋。
- `contracts/README.md` 屬 #239 範圍。此處只做最小同步以消除已存在的文件與實作分歧，若 owner 認為應由 #239 統一處理，可單獨 revert 該檔而不影響其餘變更。

## 實際驗證

- Node `v24.20.0`、npm `11.19.0`，環境未設 `NODE_NO_WARNINGS`。
- `npm run check`：45 tests 全通過、typecheck 與 architecture checker 通過。
- 真實 `npm run db:migrate`：fresh `applied=2`、rerun `applied=0`，兩次 stderr 皆為 0 bytes。
- 新增測試：constraint 分類（unique／foreign-key／check／本 owner trigger／外來 trigger／syntax error）、`DATABASE_UNAVAILABLE` 與 `INVALID_DATABASE_PATH` 分離、`db:migrate` argv 來源。

## 已知限制／後續

- `check:ai-sync`（rulesync）本輪未執行，環境無法連外；本變更未觸及 `.rulesync/` 或 rule 來源檔。
- #239 仍為 OPEN，#219 的 `Blocked by #239` 尚未解除。
- 本分支疊在 `cms/persistence-219` 之上，base 應於 PR #242 併入 `site-reset` 後改指 `site-reset`。
