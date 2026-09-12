---
id: WI-003
status: done
title: CMS-BASIC-CONTRACTS-V1｜路由圖 application core
work_group: WG-052
depends_on: ["WI-009", "WI-012", "WI-017", "WI-023"]
---

# CMS-BASIC-CONTRACTS-V1｜路由圖 application core

## Outcome
完成 [GitHub Issue #216](https://github.com/wahengchang/ai-study-note/issues/216) 的核准結果。

## Acceptance
- [x] current graph 的 NFC/full-case-fold/slash normalization、同圖 collision 拒絕與可重算 digest：已由合併 [PR #248](https://github.com/wahengchang/ai-study-note/pull/248)、完成 WI-009 與現行 `current-route-claim.test.ts` 證明。
- [x] current／published 雙圖獨立 claim、proposal freshness、locale-independent snapshot 與 target-graph isolation：已由合併 [PR #263](https://github.com/wahengchang/ai-study-note/pull/263)、完成 WI-012 與現行 `published-route-claim.test.ts` 證明。
- [x] route/source revision atomic replacement、完整 retained impact、雙圖 digest recheck 與 reject/fault 零寫入：已由合併 [PR #273](https://github.com/wahengchang/ai-study-note/pull/273)、完成 WI-017 與現行 `route-claim-replacement.test.ts` 證明。
- [x] DomainApplication 只委派 SiteDefinition 的 transaction-bound ChangeRoute，不複製 route rule：已由合併 [PR #303](https://github.com/wahengchang/ai-study-note/pull/303)、完成 WI-023 與現行 `change-route.test.ts` 證明。

## Notes
2026-09-13 closeout traceability：上述四組證據覆蓋 #216 的十三項 user stories、implementation decisions 與 testing decisions；未發現 runtime 或 acceptance 缺口，WG-052 僅記錄既有交付的驗證與 Issue closeout。
