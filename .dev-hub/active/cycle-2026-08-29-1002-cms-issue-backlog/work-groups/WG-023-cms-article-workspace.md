---
id: WG-023
status: in_progress
title: CMS article workspace
work_items: ["WI-035", "WI-041", "WI-044", "WI-049", "WI-055", "WI-056"]
owner: Main
branch: feature/cms-article-workspace
worktree: .dev-hub/worktrees/cms-article-workspace
pr: null
---

# CMS article workspace

## Delivery

Authoring read／Content Type administration／entry history／preview transport 與 Article-first CMS Workspace 已只經 owner public seam 組合；CMS runtime 以 exact Theme identity preflight，WG 維持進行中，等待真實 browser journey 與 PR 整合。

## Verification

`npm run check`：221 passed；`http-contract.test.ts`：15 passed；`cms-serve.test.ts`：2 passed；`cms-browser-bootstrap.test.ts`：1 passed。真實 `cms:serve` browser journey 尚未執行。
