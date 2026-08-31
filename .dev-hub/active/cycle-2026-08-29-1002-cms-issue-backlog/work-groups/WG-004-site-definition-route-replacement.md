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
新增 SiteDefinition route-claim replacement proposal、兩圖 retained impact、configured-store active transaction ownership，並補正 Persistence canonical-state／route claim／revision reference 的 code-unit ordering 與被誤刪的 route graph 規格句。

## Verification

`node --import tsx --test tests/core/site-definition/route-claim-replacement.test.ts`（8 pass）、`node --import tsx --test tests/core/persistence/canonical-state-ordering.test.ts`（4 pass）與 `npm run check`（109 pass）通過。

## Notes

WG-004 的 merged #273 有三個 commits，且第三個 commit 在 Cycle 非 final 時建立 completion log，違反現行每 WG 恰好兩提交 closeout 規則。原因是當時將 Work Group completed 誤當 Cycle completed。Owner 核准本次僅以前向方式刪除該 premature log、補正本紀錄；不重寫 merged history，亦不把此 waiver 視為 WG-005 以後的先例。
