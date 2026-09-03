---
id: WG-014
status: completed
title: DomainApplication ChangeRoute
work_items: ["WI-023"]
owner: Main
branch: cms/change-route
worktree: .dev-hub/worktrees/change-route
pr: null
---

# DomainApplication ChangeRoute

## Delivery
完成 WI-023／GitHub #238：發布 transaction-bound `DomainApplication.changeRoute`，保留 selected pointer、原子替換 target route claim，並記錄不建立 revision 的 `ChangeRoute` lineage。

## Verification
Node v22.22.0／npm 10.9.4（contract engines 為 Node 24.20.0／npm 11.19.0）。
`node --import tsx --test tests/core/application/change-route.test.ts`：4/4 通過。
`node --import tsx --test tests/core/application/save-revision.test.ts tests/core/application/save-revision-failures.test.ts tests/core/application/publish-revision.test.ts tests/core/application/restore-revision.test.ts tests/core/site-definition/route-claim-replacement.test.ts`：22/22 通過。
`npm run typecheck && npm run check:architecture`：通過。
`npm run check`：166/166 通過。
