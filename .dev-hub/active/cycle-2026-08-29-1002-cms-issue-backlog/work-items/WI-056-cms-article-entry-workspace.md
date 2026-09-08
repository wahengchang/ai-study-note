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

GitHub #315；實際 `cms:serve` browser/a11y journey 已通過：文章清單、新增／重載、Save、current preview 與二段 Publish 都只經核准 owner seam。WG-023 已完成。