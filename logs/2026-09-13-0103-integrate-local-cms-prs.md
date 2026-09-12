# Local CMS PR integration

- Cycle：`cycle-2026-09-13-0050-integrate-local-cms-prs`
- 完成時間：2026-09-13T01:03:38+08:00
- 狀態：completed

## 交付

將 #361、#364、#368 的仍有效 local CMS 功能收斂於單一 `site-reset` PR：repository-external 初始化、direct-browser CMS、same-machine anonymous `/v1`、CMS document/asset admission，以及 `cms:init`／`cms:start`／`cms:kill`。同步移除 browser ticket 對 CMS 前端的依賴，更新 stale browser、HTTP 與 CLI 測試。

## 關鍵決策

- #366 的 route graph contract 已由 WG-045 以不同 DTO 實作於 `site-reset`；不重複整合或回退既有 contract。
- 保留 Owner 已核准的 same-machine credential-free `/v1`；額外收緊 CMS document/asset 的 Origin、Cookie、Bearer、query 與 Fetch Metadata admission。
- `cms:kill` 只比對精確的 CMS process command，且在實際 listener smoke 中確認能停止目標。

## 實際驗證

- `npm run typecheck` 通過。
- `node --import tsx --test tests/apps/cli/cms-local-cli.test.ts tests/apps/cli/cms-kill-cli.test.ts tests/apps/authoring-api/http-contract.test.ts` 通過 41/41。
- isolated `HOME` 下執行 `npm run cms:init`，完成 CMS build、11 個 migration、Plugin/Theme package 與 Theme activation。
- `npm run cms:start` 實際監聽 `127.0.0.1:43127`；`GET /cms` 回傳 direct CMS loading shell；`npm run cms:kill` 輸出 `CMS_KILL_OK stopped=1` 並停止 listener。

## 已知限制／後續

- browser automation 兩次逾時，因此未將其列為視覺驗證；HTTP surface 與實際 CMS process flow 已驗證。

## Branch／PR

- Branch：`integrate/local-cms-prs`
- PR：https://github.com/wahengchang/ai-study-note/pull/381
