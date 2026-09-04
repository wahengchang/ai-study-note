---
id: WG-016
status: completed
title: Structured Content Read Model
work_items: ["WI-052"]
owner: Main
branch: feature/preview-public-ui-release
worktree: .dev-hub/worktrees/preview-public-ui-release
pr: null
---

# Structured Content Read Model

## Delivery

完成 WI-052／GitHub #292：以 `core/content` 提供 immutable `site-content/v1` structured read model，作為 Preview 與預設 Public Theme 的唯一內容讀取接縫。

## Verification

`npm run typecheck`、`node --import tsx --test tests/core/content/structured-read-model.test.ts`（5/5）與 `npm run check`（189/189）均通過。
