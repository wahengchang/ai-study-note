---
id: WG-023
status: completed
title: CMS article workspace
work_items: ["WI-035", "WI-041", "WI-044", "WI-049", "WI-055", "WI-056"]
owner: Main
branch: feature/cms-article-workspace
worktree: .dev-hub/worktrees/cms-article-workspace
pr: https://github.com/wahengchang/ai-study-note/pull/325
---

# CMS article workspace

## Delivery

Authoring read／Content Type administration／entry history／preview transport 與 Article-first CMS Workspace 都只經 owner public seam 組合；CMS runtime 經 exact Theme identity preflight，實際 browser journey 已完成。

## Verification

`cms:serve` 實際 browser journey：`/cms/content-types`、`/cms/content-types/new`、`/cms/content-types/article`，以及 `/cms`、`/cms/entries`、`/cms/entries/new`、`/cms/entries/:entryId` 均通過；Article v1 建立、Save、current preview、二段 Publish 與 published preview 均以實際 UI 完成。實測發現並由 WG-024 修復 module asset Origin gate、same-origin GET Origin omission 與 Article v1 SEO canonical shape。
