---
cycle: cycle-2026-08-29-1002-cms-issue-backlog
work_group: WG-023
status: completed
completed_at: 2026-09-09T18:09:02+08:00
---

# CMS Article workspace

## 交付

- 完成 Article v1 的 `/cms`、`/cms/entries`、`/cms/entries/new`、`/cms/entries/:entryId`：結構化 title/article block editor、current/published preview、dirty publish lock 與二段 Publish。
- CMS client 對成功 DTO 做 strict Zod parse；route ID fail closed；loading/error/retry、skip link、主 heading focus、roving preview tabs、modal trap/Escape/focus return 均可操作。
- 修正實際 Chromium browser 的 module asset 及 same-origin fetch admission；仍只允許核准 CMS routes。

## 關鍵決策

- Chrome 對 same-origin module asset 可帶 `Origin`，對 authenticated same-origin fetch 則可能省略 `Origin`；transport 以 exact Host、same-origin Fetch Metadata、無 cookie/Bearer admission 保持 fail-closed，並拒絕其他 Origin。
- Article editor 只送 `site-content/v1` 的 title 加單一 article text block；不引入 generic JSON editor、未核准 workspace 或 preview history route。

## 實際驗證

- `npm run typecheck` 通過。
- `npm run cms:build` 通過。
- `node --import tsx --test tests/apps/authoring-api/http-contract.test.ts`：15/15 passed。
- 實際 Chromium desktop journey：empty → create/save → current preview → dirty publish lock → Escape dialog focus return → confirmed publish → published preview；確認 skip link、sandboxed titled iframe 與 roving tab focus。

## 已知限制／後續

- 無。Cycle 仍有其他 Work Group，維持 active；WG-023 的 PR 建立後以第二個 tracking commit 寫入 URL。

## 相關 Branch／PR

- Branch：`feat/article-workspace-runtime`
- PR：尚未建立
