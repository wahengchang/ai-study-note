---
id: WG-008-published-media-selection
status: completed
title: 解析完整 published 媒體選擇
work_items:
  - WI-020
owner: Main
branch: cms/published-media-selection
worktree: .dev-hub/worktrees/published-media-selection
pr: null
---

# 解析完整 published 媒體選擇

## Delivery

新增 `DataMedia.resolvePublishedSelection`，只沿 published pointer、revision references 與已驗證 ready asset versions 解析完整 selection；任一缺失或不健康 reference 在輸出前 fail closed。

## Verification

`node --import tsx --test tests/core/media/published-selection.test.ts`（1 pass）、`node --import tsx --test "tests/core/media/*.test.ts"`（2 pass）與 `npm run check`（114 pass）通過。
