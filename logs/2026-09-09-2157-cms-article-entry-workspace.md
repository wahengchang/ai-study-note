---
cycle: cycle-2026-08-29-1002-cms-issue-backlog
work_group: WG-025
completed_at: 2026-09-09T21:57:49+08:00
status: completed
---

# CMS article entry workspace

## 交付

完成 GitHub Issue #315 的 article-first CMS 垂直切片。`/cms` 成為可建立文章並查看文章概覽的行動導向首頁；`/cms/entries` 是獨立的完整文章 history route；新增與編輯頁沿用既有 Authoring API client 的 Save、current preview、published preview 與二段 Publish seam。

預覽改為 keyboard-operable Current／Published tabs，選取的 tab 對應唯一 tabpanel 與保留 `sandbox=""` 的 iframe。發布成功會聚焦可讀 status；Escape 與取消會回到 Publish trigger。文章狀態以文字呈現，published pointer 與 current revision 分離時顯示「已發布，有未發布變更」。

## 關鍵決策

不新增 domain、transport 或 `/cms/preview` route。Authoring server 原本已 exact-allow `/cms/entries`，本次只補齊 CMS Router、document admission regression 與 contract 文件。Catalog DTO 沒有時間欄位，首頁不虛構「最近」排序或日期。

## 實際驗證

- `npm run cms:build && node --import tsx --test tests/apps/cms/article-workspace.test.ts tests/apps/authoring-api/cms-browser-bootstrap.test.ts tests/apps/authoring-api/http-contract.test.ts`：20 passed。
- `npm run check`：typecheck、architecture check、CMS production build 與全套 251 tests 全數通過。
- 新增 authenticated Chromium browser journey：empty state → Article v1 → save/current preview → keyboard preview tabs → Escape focus return → confirm publish/status focus → Article v2 save → published-with-draft；同時檢查 skip link、landmarks、dialog 與 375px 窄螢幕可操作性。

## 已知限制／後續

首頁只使用 catalog 已提供的 title、status、route；DTO 沒有排序時間，故不顯示或聲稱「最近」文章。無其他已知限制。
