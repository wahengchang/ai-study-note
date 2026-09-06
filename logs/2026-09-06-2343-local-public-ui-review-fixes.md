# 本機公開介面複審修正

- **Cycle**：`cycle-2026-08-29-1002-cms-issue-backlog`
- **完成時間**：2026-09-06T23:43:40+08:00
- **狀態**：completed

## 交付

- `Delivery.deliver()` 還原 digest 目錄的原子取得：`mkdirSync` 與 `renameSync` 各自擁有 rollback，落敗的並行交付只回收自己的 staging 並回報 `ARTIFACT_IMMUTABILITY_CONFLICT`。
- 預設 Theme 為同頁多個 Interactive Demo 產生逐個唯一的 `id`，`aria-labelledby`／`aria-describedby` 指向自己的標題與 static fallback，並與 Preview 的「互動示範 N」標示一致。
- `apps/public-ui` 對已知 route 的無斜線位址回 302 正規化 redirect（`/base`、`/base/guide`），與最終部署的斜線行為一致。
- `apps/public-ui` 以副檔名對照表宣告 content type，涵蓋 Plugin 可經 `public/assets/emit` 產出的影像與字型。

## 關鍵決策

- redirect 採 302 而非 301：本機 server 的 base path 與 port 會變動，永久 redirect 會被瀏覽器快取而誤導後續開發。
- Theme 的 raw full-page iframe 維持不加 sandbox：contract 已載明公開 raw article code 具 Owner 核准的 full-page privilege，該邊界不在本次修正範圍。
- 未擴大 `validBasePath` 的字元集合。含大寫或 `.` 的 repository 子路徑仍不被接受，屬未確認需求，不預先支援。

## 實際驗證

- `npm run check`：202/202 通過（修正前基準 198/198）。
- Delivery 迴歸以 dangling symlink 重現 `existsSync` 與 `mkdir` 之間的並行分支：修正前回 `ARTIFACT_WRITE_FAILED` 並刪除既有 digest 目錄，修正後回 `ARTIFACT_IMMUTABILITY_CONFLICT` 且目錄完整。
- 雙 process 同時交付相同 output 15 次：修正前 12/15 次已回報成功的 immutable artifact 遭落敗者刪除，修正後 0/15。

## 已知限制／後續

- `Delivery.deliver()` 仍以 `existsSync` 先行短路，並行時的錯誤碼因此可能是 `ARTIFACT_IMMUTABILITY_CONFLICT`（早退）或同碼（mkdir 落敗），兩者語意一致但來源不同。
- `If-None-Match` 只比對 strong ETag，經過會改寫成 weak ETag 的 proxy 時會退化成重送完整 bytes。
- GitHub Pages、release 與 deploy workflow 依 Owner 決策仍不在範圍。

## 相關 Branch／PR

- Branch：`feature/local-public-ui`
- PR：[#312](https://github.com/wahengchang/ai-study-note/pull/312)
