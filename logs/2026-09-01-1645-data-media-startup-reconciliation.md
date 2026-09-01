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

## 相關 Branch／PR

- Branch：`cms/data-media-startup-reconciliation`
- PR：尚未建立。
