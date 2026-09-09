---
id: WI-056
status: pending
title: CMS article entry workspace
work_group: null
depends_on: ["WI-040", "WI-035", "WI-041", "WI-044", "WI-049"]
---

# CMS article entry workspace

## Outcome

完成 [GitHub Issue #315](https://github.com/wahengchang/ai-study-note/issues/315) 的 article-first 文章管理垂直切片。

## Acceptance

`/cms`、`/cms/entries`、`/cms/entries/new`、`/cms/entries/:entryId` 的實際 browser/a11y gate 通過；Save、current preview 與二段 Publish 只經已核准 owner seam。

## Notes

`site-reset` 的 `apps/cms/workspace.tsx` 已交付 `/cms`、`/cms/entries/new`、
`/cms/entries/:entryId` 的 article workflow：save、current／published preview、dirty publish lock 與
`<dialog>` 二段 Publish；但缺少 #315 acceptance 要求的 `/cms/entries` 明確 history route。因此不可將
現有測試視為四條 canonical route 的 browser/a11y gate，WI-056 維持 `pending`，待獨立 Work Group 補齊。
實作來自 #332／#334，不是 #337；#337 不合併。
