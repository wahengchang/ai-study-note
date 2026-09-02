---
id: WG-011-authoring-credential-save-revision
status: completed
title: Authoring credential and SaveRevision
work_items: ["WI-036", "WI-037"]
owner: Main
branch: cms/authoring-credential-save-revision
worktree: .dev-hub/worktrees/authoring-credential-save-revision
pr: https://github.com/wahengchang/ai-study-note/pull/299
---

# Authoring credential and SaveRevision

## Delivery
實作 local credential lifecycle、fixed-origin Bearer envelope、server proof 與 authenticated SaveRevision。

## Verification
`node --import tsx --test tests/apps/authoring-api/credential-lifecycle.test.ts tests/apps/authoring-api/credential-cli.test.ts`：3/3 通過。
`npx tsc --noEmit --pretty false && node --import tsx --test tests/apps/authoring-api/http-contract.test.ts`：actual `127.0.0.1:43127` proof 與 authenticated SaveRevision 通過。
`npm run check`：142 tests 通過，typecheck 與 architecture checker 通過。
