---
id: WG-019
status: completed
title: CMS workspace router
work_items: ["WI-031"]
owner: Main
branch: feature/cms-workspace-router
worktree: .dev-hub/worktrees/cms-workspace-router
pr: null
---

# CMS workspace router

## Delivery

完成 GitHub #257 的 router：拆分八個 CMS surface Work Issues／Work Items、固定 canonical UI paths 與 browser/a11y gates，並將 Entry article-first vertical slice 留給後續獨立 Work Group。同步校正 browser bootstrap contract 與 #280／#289 的 owner seam、secret lifecycle、Fetch Metadata 與 final-phase release boundary。

## Verification
`gh issue view 257/280/289 --json state,body` 已確認 router、API-06 與 Projection owner-seam cross-link；`gh issue list --search 'CMS-UI-'` 已確認 #314–#321 八個 surface Issue。逐一確認 `WI-055`–`WI-062` 的 canonical paths、dependency 與 browser/a11y gate；`WI-061` 明列 blocked 與 Owner final-phase 解除條件。`git diff --check` 已通過。