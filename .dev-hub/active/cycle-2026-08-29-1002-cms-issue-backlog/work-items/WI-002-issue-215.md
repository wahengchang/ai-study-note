---
id: WI-002
status: done
title: CMS-BASIC-CONTRACTS-V1｜內容生命週期 application core
work_group: WG-052
depends_on: ["WI-015", "WI-018", "WI-022", "WI-023"]
---

# CMS-BASIC-CONTRACTS-V1｜內容生命週期 application core

## Outcome
完成 [GitHub Issue #215](https://github.com/wahengchang/ai-study-note/issues/215) 的核准結果。

## Acceptance
- [x] SaveRevision 的 schema／media／route preflight、immutable revision、current claim 與失敗零寫入：已由合併 [PR #248](https://github.com/wahengchang/ai-study-note/pull/248)、完成 WI-015 與現行 `save-revision.test.ts`／`save-revision-failures.test.ts` 證明。
- [x] PublishRevision 僅移動 published pointer／claim、保留 current，並在 stale、schema、media、route gate 失敗時零寫入：已由合併 [PR #274](https://github.com/wahengchang/ai-study-note/pull/274)、完成 WI-018 與現行 `publish-revision.test.ts` 證明。
- [x] RestoreRevision 以新 immutable revision 保留歷史、封存或缺失媒體先回可呼叫 RestoreAsset remediation 並零寫入：已由合併 [PR #297](https://github.com/wahengchang/ai-study-note/pull/297)、完成 WI-022 與現行 `restore-revision.test.ts` 證明。
- [x] ChangeRoute 只經 SiteDefinition 已核發 proposal 原子套用、保留 selected pointer 並在競爭／fault rollback lineage 與 claims：已由合併 [PR #303](https://github.com/wahengchang/ai-study-note/pull/303)、完成 WI-023 與現行 `change-route.test.ts` 證明。

## Notes
2026-09-13 closeout traceability：上述四組證據覆蓋 #215 的十五項 user stories、implementation decisions 與 testing decisions；未發現 runtime 或 acceptance 缺口，WG-052 僅記錄既有交付的驗證與 Issue closeout。
