# CMS 本機初始化命令

- **Cycle**：`cycle-2026-09-11-0929-cms-init-command`
- **完成時間**：2026-09-11T09:39:12+08:00
- **狀態**：completed

## 交付

- 新增 `npm run cms:init`：建置 CMS assets，並在 `HOME/.local/share/ai-study-note-reset/cms` 初始化 migration database、media root、installed Plugin/Theme 與 active Theme；credential 沿用既有 CLI 的 `XDG_CONFIG_HOME` 或 `HOME/.config/ai-study-note/` 位置。
- 新增 `npm run cms:start`：以同一無參數 runtime 組裝並啟動 CMS。
- 新增 CLI contract test 與 production command matrix 記錄；依 Owner 決策，`cms:open` 透過 macOS `open` 使用預設瀏覽器，並將一次性 ticket 放在 URL fragment。CMS document、asset 與 browser session admission 相容未送 Fetch Metadata 的預設瀏覽器。

## 關鍵決策

runtime 必須在 repository 外：extension packager 明確拒絕 repository 內 installed root。credential 則沿用 `cms:open`／`cms:credential`／`cms:save-revision` 的 `XDG_CONFIG_HOME`（未設定時為 `HOME/.config`）store，確保啟動 runtime 可被既有 CLI 開啟。browser session 仍要求 exact Origin、無 Bearer；CMS document／asset 同樣只接受 absent 或 exact local Origin，Fetch Metadata 有送時保留 exact destination／same-origin gate。未送時才以 exact Origin 相容預設瀏覽器。初始化 CLI 留在 Authoring API owner，對既有獨立 CLI 用 subprocess 呼叫，避免違反 app owner import boundary。

## 實際驗證

- `node --import tsx --test tests/apps/cli/cms-local-cli.test.ts`：2/2 通過。
- temporary HOME 的 `npm run cms:init`：完成 CMS build、database migration、extension packaging、Theme activation 與 standard local credential provisioning；同時驗證自訂 `XDG_CONFIG_HOME`。
- `npm run cms:start`：成功監聽 `http://127.0.0.1:43127`；既有 local client 以相同 XDG credential 成功 mint browser ticket，且以正確 CMS navigation headers 請求 `/cms/plugins` 回應 200。
- `npm run check`：browser 選擇修正前 266/266 通過；default-browser document／asset／session 相容修正後 `npm run typecheck && npm run check:architecture` 通過。

## 已知限制／後續

Browser relay 未連線，無法以 browser tool 執行視覺驗證；default-browser Fetch Metadata regression test 與完整 check 受使用者正在佔用 `127.0.0.1:43127` 的 CMS server 阻擋，未停止使用者 process。

## 相關 Branch／PR

- Branch：`feat/cms-init`
- PR：https://github.com/wahengchang/ai-study-note/pull/361
