---
id: WG-007-replace-media-reference
status: completed
title: 原子替換 current revision 媒體引用
work_items:
  - WI-019
owner: Main
branch: cms/replace-media-reference
worktree: .dev-hub/worktrees/replace-media-reference
pr: https://github.com/wahengchang/ai-study-note/pull/294
---

# 原子替換 current revision 媒體引用

## Delivery

新增 `DomainApplication.replaceMediaReference`：從指定 current source revision 複製完整 reference set，只替換一個 ready target，建立 immutable new current revision；published pointer／claim 與歷史 revision/reference 維持不變。

## Verification

`node --import tsx --test tests/core/application/replace-media-reference.test.ts`（1 pass）、`node --import tsx --test "tests/core/application/*.test.ts"`（14 pass）與 `npm run check`（113 pass）通過。
