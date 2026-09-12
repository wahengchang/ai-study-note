---
id: WI-003
status: done
title: CMS-BASIC-CONTRACTS-V1｜路由圖 application core
work_group: WG-048
depends_on: ["WI-009", "WI-012", "WI-017", "WI-023"]
---

# CMS-BASIC-CONTRACTS-V1｜路由圖 application core

## Outcome
完成 [GitHub Issue #216](https://github.com/wahengchang/ai-study-note/issues/216) 的核准結果。

## Acceptance traceability

- **current 路由正規化與 claim**：PR [#248](https://github.com/wahengchang/ai-study-note/pull/248)／WI-009 以 canonical route 與 transaction-bound claim 建立 current graph；`current-route-claim.test.ts` 與 `route-normalization.test.ts`。
- **雙圖 published isolation**：PR [#263](https://github.com/wahengchang/ai-study-note/pull/263)／WI-012 以 opaque proposal、雙 digest 與 deterministic ordering 隔離 current/published graph；`published-route-claim.test.ts`；工作紀錄 `logs/2026-08-28-2258-published-route-claim.md`。
- **原子 replacement impact**：PR [#273](https://github.com/wahengchang/ai-study-note/pull/273)／WI-017 回報 retained impact、重驗兩圖 baseline，並在 failure 回滾；`route-claim-replacement.test.ts`；工作紀錄 `logs/2026-08-31-1220-site-definition-route-replacement.md`。
- **Application ChangeRoute**：PR [#303](https://github.com/wahengchang/ai-study-note/pull/303)／WI-023 將 serializable proposal 綁至 current/published digest，在無 pointer move 與無新 revision 下提交；`change-route.test.ts`。
- **整體交叉驗證**：2026-09-12 的四個 core domain suite 97/97 通過，含 collision、Unicode normalization、雙圖 fresh/stale、proposal tamper、competition 與 fault rollback。上述 acceptance 已完整覆蓋，未發現需新開 Work Item 的缺口。

## Notes

GitHub #216 已完成；實際依賴為 WI-009、WI-012、WI-017、WI-023。
