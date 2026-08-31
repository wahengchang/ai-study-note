---
id: WG-007-replace-media-reference
status: completed
title: 原子替換 current revision 媒體引用
work_items: []
owner: Main
branch: cms/replace-media-reference
worktree: .dev-hub/worktrees/replace-media-reference
pr: https://github.com/wahengchang/ai-study-note/pull/294
---

# 原子替換 current revision 媒體引用

## Delivery

先前實作新增獨立 `DomainApplication.replaceMediaReference`，後續確認與核准的 SaveRevision request 契約不符；其修正交由 WG-009，故不再認領 WI-019。

## Verification

`node --import tsx --test tests/core/application/replace-media-reference.test.ts`（1 pass）、`node --import tsx --test "tests/core/application/*.test.ts"`（14 pass）與 `npm run check`（113 pass）通過。
