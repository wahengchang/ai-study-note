---
id: WI-056
status: done
title: CMS article entry workspace
work_group: WG-023
depends_on: ["WI-040", "WI-035", "WI-041", "WI-044", "WI-049"]
---

# CMS article entry workspace

## Outcome

完成 [GitHub Issue #315](https://github.com/wahengchang/ai-study-note/issues/315) 的 article-first 文章管理垂直切片。

## Acceptance

`/cms`、`/cms/entries`、`/cms/entries/new`、`/cms/entries/:entryId` 的實際 browser/a11y gate 通過；Save、current preview 與二段 Publish 只經已核准 owner seam。

## Notes

GitHub #315；Article-first `/cms` 四條 history route 已交付。actual Chromium journey 驗證 empty → create/save → current preview → dirty publish lock → Escape focus return → two-step Publish → published preview；所有 actions 經既有 authenticated `/v1` seam。