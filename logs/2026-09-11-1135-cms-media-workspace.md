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

## 審查後修正（2026-09-11）

- entry editor 的 SEO analysis effect 誤刪了 `if (!valid || conflict) { setAnalysisBusy(false); return; }`
  守門，使無效草稿與 conflict lock 狀態下仍每 400ms 送出 analysis request（並可在 409 時反覆搶走
  reload 按鈕焦點）。已復原；此守門屬 #308 editor 契約的 conflict lock 行為，與 Media workspace 無關。
- CMS 只解析 `authoring-error/v1`，因此契約要求的 `media-archive-blocked/v1` 與
  `media-restore-required/v1` 會退化成無法行動的 `CMS_RESPONSE_INVALID`。現在兩者都被解析：
  封存被阻擋時顯示完整 published 引用，缺 bytes 的復原時引導使用者到本機 recovery 表單。
- browser gate 原本斷言未知 asset 顯示 `Media 讀取無法驗證。`（503）；契約規定 unknown asset 是 404，
  對應 UI 既有的「找不到媒體 asset。」分支。已改為斷言該 404 文案，並新增封存被 published 引用阻擋時
  顯示完整引用的 keyboard journey 斷言。

### 追加驗證

- `npm run typecheck`、`npm run check:architecture`、`npm run cms:build`
- `node --import tsx --test tests/apps/cms/runtime-browser-gate.test.ts`（6 passed）
- `node --import tsx --test tests/apps/cms/seo-workspace.test.ts tests/apps/cms/article-workspace.test.ts tests/apps/cms/session-client.test.ts`（3 passed）

## 已知限制

- `tests/apps/cms/plugin-editor-blocks.test.ts` 的兩個 case 在本次審查環境無法通過；同樣的失敗在
  `site-reset` 基線重現，與本 PR 無關（審查環境替換了 pinned Chromium build）。
