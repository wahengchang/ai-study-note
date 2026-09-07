# CMS browser bootstrap review hardening

- **Cycle**：`cycle-2026-08-29-1002-cms-issue-backlog` / `WG-020`
- **完成時間**：2026-09-07T15:25:50+08:00
- **狀態**：PR #323 review 後的補強，仍等待外部 reviewer 合併。

## 交付

- `authoring-session.ts` 兩個 browser fetch 補上 contract §7 明列的 `redirect:"error"`（session exchange 與 `authorizedFetch` 原本只有 `credentials`／`cache`／`referrerPolicy` 三項）。
- `authoring-session.ts` 補上 contract §7 的 `pagehide 清 key`：session 建立時掛 `pagehide` listener，`lock()` 內移除，bfcache 還原的 page 不會帶著已離開 session 的 bearer。
- `authoring-session.ts` 的 `authorizedFetch` 改為先判斷 `init.signal.aborted`：已 abort 的 signal 不會再送 abort event，原本只掛 listener 會讓該 request 照樣送出。
- `cms-assets.ts` 在 `loadCmsAssets()` 一次讀入 manifest allowlist 的 bytes 並常駐，`read()` 只做 Map lookup：request path 不再觸發 synchronous filesystem I/O，listener 啟動後被替換的檔案也不會混進已驗證的 allowlist。
- `open-cms-cli.ts` 移除 `watchedBrowser === undefined` 這個不可達分支（該處 `browser` 必已 assign）。
- `npm run check` 在 `npm test` 前串入 `npm run cms:build`：`cms-browser-bootstrap.test.ts` 斷言 `dist/cms` manifest 存在，而 `dist/` 是 gitignored generated root，原本 clean checkout 直接跑 `npm run check` 必失敗。
- `cms-browser-bootstrap.test.ts` 三項修正：以 repository root 定位 `dist/cms`（原本是 cwd-relative 字面值）；`chromium.launch()` 失敗時也關閉 listener；heading 斷言改 `exact: true` 並加上 unlocked 文案與 `document.documentElement.outerHTML` 的 canary 斷言。

## 關鍵決策

- 不改動 `apps/authoring-api/cms/` 的檔案位置。contract §6 寫的是 `apps/cms/index.ts` 為唯一 CMS public entry，與本 PR 的實作位置不一致；這屬於 Owner 的 architecture 決策，不在 review 補強範圍內單方面搬移。
- 不改 `cms:open` 的 argv 介面。contract §6 列的是 `cms:open --plugins|--entry-id <id>`，實作目前拒絕所有 argv；同樣留給 Owner 決定是補齊 flag 還是修訂 contract。
- `check` 串 `cms:build` 而非讓 test 自行 build：維持既有 script manifest 不變，也讓 build 失敗直接停在 gate 上而不是變成 test failure。

## 實際驗證

- runtime：Node `24.20.0`、npm `11.19.0`（contract §6 指定值）。
- `rm -rf dist && npm run check`：typecheck、`check:architecture`、`cms:build`、210/210 test 全數通過。
- 反證 heading 斷言：把 test server 的 `/_local/browser-session` 改回 `500` 後，修正前的 test 仍 pass（`getByRole` 預設 substring 比對，靜態 `<h1>CMS 工作台已鎖定</h1>` 直接命中），修正後正確 fail。
- 反證 `dist` 相依：搬走 `dist/` 後 `cms-browser-bootstrap.test.ts` 以 `cms:build 必須先產生 Vite manifest` 失敗。
- 反證 listener 洩漏：`chromium.launch()` 失敗時，修正前整個 `node --test` 會停在 `Promise resolution is still pending but the event loop has already resolved` 直到外部 timeout。

## 已知限制／後續

- 沒有 production entrypoint 會 `startAuthoringApi()`；`cms:open` 啟動 browser 後仍指向沒有人 listen 的 `127.0.0.1:43127`，端對端要等 contract §6 的 `cms:serve`。
- `SessionGate` 的 `useEffect` 在 React `StrictMode` 下會二次執行，而 ticket 是 one-shot；production build 不會 double-invoke，但一旦加入 Vite dev server，開發模式會直接鎖定。
- `server.ts` 的 CMS document HTML 是手寫的，與 `apps/authoring-api/cms/index.html` 及 `cms:build` 產出的 `dist/cms/index.html` 各自獨立；目前沒有測試固定兩者一致。
- `playwright` 放在 `dependencies`、`vite`／`@vitejs/plugin-react` 放在 `devDependencies`，但兩者都被 `apps/` 下的檔案 import；分類待 Owner 確認。
- `package.json` 的 test glob 仍是 `tests/**/*.test.ts`，architecture checker 與 `tsconfig.json` 已接受 `.test.tsx`；目前沒有 `.test.tsx` 檔案，屬 latent 不一致。

## 相關 Branch／PR

- Branch：`feature/cms-browser-bootstrap`
- PR：https://github.com/wahengchang/ai-study-note/pull/323
