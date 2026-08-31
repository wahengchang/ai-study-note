---
id: WG-004-site-definition-route-replacement
status: completed
title: 原子替換 route claim
work_items:
  - WI-017
owner: Main
branch: cms/site-definition-route-replacement
worktree: .dev-hub/worktrees/site-definition-route-replacement
pr: https://github.com/wahengchang/ai-study-note/pull/273
---

# 原子替換 route claim

## Delivery
新增 SiteDefinition route-claim replacement proposal、兩圖 retained impact、configured-store active transaction ownership 與 TOCTOU 防線。

## Verification
`node --import tsx --test tests/core/site-definition/route-claim-replacement.test.ts`（4 pass）、`node --import tsx --test "tests/core/site-definition/*.test.ts"`（12 pass）與 `npm run check`（101 pass）通過。
