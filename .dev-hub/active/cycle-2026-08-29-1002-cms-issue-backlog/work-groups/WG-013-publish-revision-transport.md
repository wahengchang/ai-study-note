---
id: WG-013
status: completed
title: PublishRevision transport
work_items: ["WI-039"]
owner: Main
branch: cms/publish-revision-transport
worktree: .dev-hub/worktrees/publish-revision-transport
pr: null
---

# PublishRevision transport

## Delivery
執行 GitHub #279 的 API-05：新增 Bearer authenticated PublishRevision transport 與 typed local client，沿用同 TCP connection 的 proof-before-Bearer 安全閘門。

## Verification
`node --import tsx --test tests/apps/authoring-api/http-contract.test.ts`：12/12 通過。
`npm run typecheck && npm run check:architecture`：通過。
`npm run check`：162/162 通過。
runtime：Node v22.22.0／npm 10.9.4；與 contract 指定 Node 24.20.0／npm 11.19.0 不同。
