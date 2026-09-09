---
id: WI-056
status: done
title: CMS article entry workspace
work_group: WG-025
depends_on: ["WI-040", "WI-035", "WI-041", "WI-044", "WI-049"]
---

# CMS article entry workspace

## Outcome

完成 [GitHub Issue #315](https://github.com/wahengchang/ai-study-note/issues/315) 的 article-first 文章管理垂直切片。

## Acceptance

`/cms`、`/cms/entries`、`/cms/entries/new`、`/cms/entries/:entryId` 的實際 browser/a11y gate 通過；Save、current preview 與二段 Publish 只經已核准 owner seam。

## Notes

WG-025 已交付 `/cms`、`/cms/entries`、`/cms/entries/new`、`/cms/entries/:entryId` 的 four-route article workflow。打包 CMS 的 authenticated Chromium browser/a11y journey 覆蓋 empty state、Article v1 save、Current／Published tabs、Escape/取消焦點回復、二段 Publish、Article v2 與 published-with-draft；Save、preview 與 Publish 仍只經既有 owner seam。實際驗證與決策記於 `logs/2026-09-09-2157-cms-article-entry-workspace.md`。
