---
id: WG-039
status: completed
title: RestoreRevision transport
work_items: ["WI-045"]
owner: Main
branch: feature/restore-revision-transport
worktree: /Volumes/UGREEN 2TB /projects/ai-study-note-reset/.dev-hub/worktrees/restore-revision-transport
pr: null
---

# RestoreRevision transport

## Delivery

以 Authoring API 的 exact authenticated route 接受 `restore-revision-request/v1`，委派既有 DomainApplication RestoreRevision，回傳安全 receipt 與 Media recovery descriptor；不改動 application contract。

## Verification

`npm run typecheck`、`node --import tsx --test tests/apps/authoring-api/http-contract.test.ts`、`npm run check:architecture` 與 `git diff --check` 均通過。
