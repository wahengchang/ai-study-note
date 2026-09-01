# DataMedia 啟動安全收斂

- **Cycle**：`cycle-2026-08-29-1002-cms-issue-backlog`
- **Work Item**：`WI-013`
- **Work Group**：`WG-010-data-media-startup-reconciliation`
- **完成時間**：2026-09-01T16:45:00+08:00
- **狀態**：completed

## 交付

- 以 `startDataMedia()` 取代 operational `createDataMedia()`；只在 Persistence 與 local object storage snapshots 已完成安全收斂、orphan cleanup 與 fresh-state 驗證後回傳 instance。
- Persistence 新增 immutable media startup snapshot、完整 canonical metadata 驗證、exact intent delete、exact-idempotent ready commit 與 version lookup。
- Local object storage 以 pinned root／managed-directory identity、FD streaming SHA-256、two-pass snapshot、opaque candidate token、hardlink crash-pair 與 compare-before-unlink orphan removal 收斂 filesystem boundary。
- 所有六個實際 factory caller 改為只在 successful `startDataMedia()` 後取得 `DataMedia`；新增 restart state matrix 與 digest-idempotence test。

## 關鍵決策

- Media 對 Persistence 保持 structural port，不跨 owner import Persistence types；兩側 snapshot record 維持相容 shape。
- SQLite snapshot 從完整 `asset_versions` graph 讀取並驗證 object、availability、media asset 與 revision reference，不以 inner join 把損壞關係誤判成 absence。
- 本機 filesystem 威脅模型維持核准的單一 local owner/process。Node path-based API 無法原子綁定 directory inode；所有可觀察的 namespace race 皆 fail closed，但不宣稱可防禦不可觀察的 swap-back race。

## 實際驗證

- `npm run typecheck`
- `node --import tsx --test tests/core/media/startup-reconciliation.test.ts tests/core/media/local-import.test.ts tests/core/media/published-selection.test.ts`：10 pass。
- `node --import tsx --test tests/core/application/save-revision.test.ts tests/core/application/save-revision-media-replacement.test.ts tests/core/application/save-revision-plugin-composition.test.ts tests/core/application/publish-revision.test.ts tests/core/application/save-revision-failures.test.ts`：20 pass。
- `npm run check`：typecheck、architecture checker 與完整測試共 128 pass。
- `createDataMedia` 與其 import 搜尋結果皆為零。

## 已知限制／後續

- 無。環境安全假設如「關鍵決策」所述，與核准 contract 的單一 local owner/process 範圍一致。

## 審查收斂（2026-09-01 二次）

與 `site-reset` 上已合入的 `WG-010-archive-restore-revision`（PR #297）合併，並修正審查中發現的問題。

### 修正的缺陷

- **ready 版本 bytes 遺失會讓 CMS 完全無法啟動**：原本任一 `ready` asset version 找不到 final object 就整體回 `MEDIA_RECONCILIATION_FAILURE`，而 `RestoreAsset` 必須先取得 `DataMedia` instance 才能呼叫，等於把契約指定的唯一 remediation 鎖在無法到達的狀態。改為降級為 `missing`，啟動成功、該版本依既有規則 fail closed，並由 `inspectRestoreAvailability`／`RestoreAsset` 復原。
- **兩筆相同 bytes 的 pending intent 依處理順序決定成敗**：未與 final 配對的 stage 也被送進 `releaseStage`，pair 不符即失敗；先處理未配對者就會收斂失敗，先處理已配對者則成功。改為只有互為 hardlink 的 stage 由 `releaseStage` 收斂，多餘 stage 交給 orphan 清理。
- **`final-only` 分支的重構破口**：收斂分支改寫後，只有 final、沒有 stage 的 intent 會被誤刪 intent 而非提交為 ready；由既有 restart matrix 測試擋下並修正。

### 效能

啟動時同一份 object bytes 會被重複做完整 SHA-256：snapshot 第二輪重掃、`healthyVersions` 每個版本兩次 `verifyFinal`、收斂前後各跑一次完整驗證。改為第二輪只比對 stat metadata（bytes digest 已於第一輪在同一 fd 上驗證）、每個版本只驗一次、收斂後只檢查結構性後置條件。24×1 MiB 媒體庫的 `startDataMedia` 中位數由 790 ms 降至 356 ms（約 2.2 倍），且差距隨媒體庫大小線性放大。

### 其他收斂

- 移除 `MediaAvailability`／`MediaAssetVersionRecord` 與 `AssetVersionAvailability`／`AssetVersionRecord` 的重複型別，media 與 persistence 兩側各只保留一組。
- `asset_versions` 查詢統一為單一 `ASSET_VERSION_SQL`（LEFT JOIN + 逐欄驗證），損壞的關聯回 `STORAGE_FAILURE` 而非被 inner join 誤判為 absence。
- 保留 PR #297 的 media root 擁有者／權限檢查（uid、group/other 不可寫、realpath 一致），並套用到 object storage 的檔案 stat 路徑。
- `importLocal` 在既有 ready 版本相符時直接回傳，避免重寫整份 staging bytes，也避免衝突的 import 在 commit 階段才失敗而留下無法收斂的 pending intent。
- 移除無法觸發的重複 key 檢查、`stageUse` 計數與 orphan 排序中的多餘型別守衛。

### 二次驗證

- `npm run check`：typecheck、architecture checker 與完整測試共 138 pass。
- 新增兩個回歸測試（同 bytes intent 順序無關收斂、bytes 遺失降級與復原），已確認在修正前的邏輯下均為 fail。

## 相關 Branch／PR

- Branch：`cms/data-media-startup-reconciliation`
- PR：https://github.com/wahengchang/ai-study-note/pull/298
