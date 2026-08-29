---
id: WG-001-planned-backlog-onboarding
status: completed
title: Planned backlog onboarding
work_items:
  - WI-033
owner: Main
branch: chore/dev-hub-planned-backlog
worktree: .dev-hub/worktrees/dev-hub-planned-backlog
pr: null
---

# Planned backlog onboarding

## Delivery
schema v3、34 backlog Work Items、37 Issue links 與 generated overview HTML。

## Verification
`npx --yes node@24.20.0 --import tsx --test tests/scripts/render-dev-hub-overview.test.ts`、`npm run dev-hub:overview` 與 `npm run dev-hub:overview:check` 通過。`npm run typecheck`、`npm run check:architecture` 與 `npm test` 受 worktree 未安裝 `unicode-case-folding`、`es-module-lexer` 阻擋；renderer contract test 已通過。
