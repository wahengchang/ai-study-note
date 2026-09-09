---
name: demo-e2e
description: 用可見 Chromium 實際示範一次已完成的 end-to-end 行為，並保留結果畫面。
disable-model-invocation: true
---

Don't tell me it works. Show me the behavior. 啟動實際 app，用可見（非 headless）的 Chromium 親自走完本次變更的主要 end-to-end flow，讓使用者看到具體 input → observable output；tests、screenshots 或 source inspection 都不能替代。

完成後停在結果畫面，保留瀏覽器視窗與必要服務直到使用者手動關閉。

## 本專案的實際入口

- 公開站台：先取得已驗證的 artifact，再以 `npm run site:serve -- --artifacts-root <絕對路徑> --artifact-digest <sha256:...> --base-path <base>` 啟動，然後用自行啟動的 headed Chromium（Playwright `chromium.launch({ headless: false })`）開啟它印出的 URL。
- CMS：`npm run cms:build` 產生 bundle。官方入口 `npm run cms:open` 以 Playwright private pipe **headless** 啟動，且刻意不傳 profile、debug port 或帶 ticket 的 argv——那是 `apps/authoring-api/open-cms-cli.ts` 的安全設計，不得為了示範改動它。需要可見示範時，另外以 headed Chromium 重現同一條使用者路徑。
- 資料庫：`npm run db:migrate -- --database <路徑>`。

## Blocker

真實流程被無法取得的環境、帳號或密鑰阻擋，或當前環境沒有可見視窗（遠端 container、CI、無 display），直接顯示並回報 blocker：說明卡在哪一步、缺什麼。不得改跑 headless 後宣稱已完成示範，也不得偽造成功。
