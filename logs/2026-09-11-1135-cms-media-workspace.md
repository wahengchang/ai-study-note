# CMS media workspace

## 交付

- 加入 `/cms/media` catalog、`/cms/media/import` 檔案匯入與 `/cms/media/:assetId` version detail/lifecycle workspace，含 replacement 與 recovery forms。
- CMS 只經 Authoring API strict DTO 呼叫 Media catalog/detail/import/version replacement/archive/restore；不讀取 DataMedia、Persistence、檔案系統或 metadata/媒體 bytes。
- 三條 CMS document route 進入 exact server allowlist 與 structured logger template。

## 關鍵決策

- browser workspace 只顯示安全 evidence 與 availability；不顯示 metadata、bytes、路徑、token 或 raw failure。
- replacement 明確選擇 current reference，建立 replacement version 並顯示 published pointer 不會前移；archive／restore 先要求使用者確認。
- restore descriptor 指示 `recovery:"local-bytes-and-metadata"` 時，CMS 要求使用者提供本機 bytes 與 JSON metadata；`recovery:"none"` 則只發出 restore command。
- replacement browser gate 先在 archive／restore 後，以 Authoring transport 將 `runtime-media@v1` 寫入並發布；再由 CMS keyboard replacement，最後直接驗證 current 與 published 的 immutable reference 分離，避免封存已發布引用被 domain rule 阻擋。
- Media import 在 pending 期間提供 `aria-busy` 與 polite live status；browser gate 除檔案輸入使用 `setInputFiles` 外，以 keyboard focus／Enter 驅動 Media 路由與命令。

## 驗證

- `npm run check`（267 passed）

## 已知限制

- 無。
