# CMS browser journey remediation

- **完成時間**：2026-09-08T18:20:54+08:00
- **Cycle／Work Group**：`cycle-2026-08-29-1002-cms-issue-backlog`／`WG-024`

## 交付

- 修正實際 module script 會攜帶 exact same-origin `Origin` 時被 `/cms/assets/*` 錯誤拒絕的 gate。
- 修正 authenticated same-origin browser `GET` 可省略 `Origin` 而仍有 Fetch Metadata 時被 `/v1/*` 錯誤拒絕的 gate；跨站仍拒絕。
- 令 Article v1 的 required `seo` 進入 Content、Projection strict parser 與 CMS reload/save round-trip，避免合法 immutable revision 在讀取時 fail closed 或被 UI 靜默覆寫。
- 實際完成 Content Type 與 Article authoring browser/a11y journey。

## 關鍵決策

保留 Article v1 immutable schema 的 required `seo`，不以移除欄位或 AuthoringReadFacade 特判繞過。Content read model 對既有 generic `site-content/v1` 保持無 `seo` 相容；若存在則只接受 `title`、`description`、`canonicalPath` 的 non-empty string allow-list，並以 defensive copy 交給 projection。

## 實際驗證

- `npm run typecheck` 通過。
- `structured-read-model.test.ts`、`strict-parse.test.ts`、`http-contract.test.ts`、`cms-serve.test.ts` 的隔離驗證通過。
- 實際 `cms:serve` browser journey：assets、Article v1、Save、current preview、二段 Publish、published preview、published 清單狀態均通過。

## 已知限制／後續

`npm run check` 的測試 runner 會平行執行多個固定 `127.0.0.1:43127` listener 測試；唯一失敗為 `cms-serve.test.ts` 的 `CMS_LISTENER_UNAVAILABLE`。各 fixed-port suite 單獨執行均通過。此 log 不變更該既有測試並行策略。

## 相關 Branch／PR

- Branch：`fix/cms-browser-authoring-journey`
- PR：https://github.com/wahengchang/ai-study-note/pull/328
