---
id: WG-001
status: completed
title: Save Revision foundation
work_items:
  - WI-001
  - WI-002
  - WI-003
  - WI-004
  - WI-005
owner: wahengchang
branch: cms/save-revision-foundation
worktree: .dev-hub/worktrees/save-revision-foundation
pr: null
---

## Delivery

實作 #221、#222、#223、#227、#228 的可信 `SaveRevision` 直向切片。

## Verification

`node --import tsx --test "tests/core/persistence/*.test.ts"`、`node --import tsx --test "tests/core/site-definition/*.test.ts"`、`node --import tsx --test "tests/core/media/*.test.ts"`、`node --import tsx --test tests/core/application/save-revision.test.ts`、`npm run check` 與 `npm run check:ai-sync` 均已通過。
