---
id: WI-004
status: done
title: CMS-BASIC-CONTRACTS-V1｜媒體生命週期 application core
work_group: WG-052
depends_on: ["WI-010", "WI-013", "WI-014", "WI-019", "WI-020", "WI-021"]
---

# CMS-BASIC-CONTRACTS-V1｜媒體生命週期 application core

## Outcome
完成 [GitHub Issue #217](https://github.com/wahengchang/ai-study-note/issues/217) 的核准結果。

## Acceptance
- [x] local import 只在 immutable evidence 與 final bytes 驗證後成為 ready，revision reference 為 append-only：已由合併 [PR #248](https://github.com/wahengchang/ai-study-note/pull/248)、完成 WI-010／WI-014 與現行 `local-import.test.ts` 證明。
- [x] startup reconciliation 處理 staged／pending／final evidence、保留可重試 fault、清除 orphan 並維持 idempotence：已由合併 [PR #298](https://github.com/wahengchang/ai-study-note/pull/298)、完成 WI-013 與現行 `startup-reconciliation.test.ts` 證明。
- [x] replacement 經 SaveRevision 建立新 version／revision，保留 source 與 published pinning：已由合併 [PR #296](https://github.com/wahengchang/ai-study-note/pull/296)、完成 WI-019 與現行 `save-revision-media-replacement.test.ts` 證明。
- [x] published selection 僅循 published pointer 到 verified ready asset，任何不完整 selection fail closed：已由合併 [PR #295](https://github.com/wahengchang/ai-study-note/pull/295)、完成 WI-020 與現行 `published-selection.test.ts` 證明。
- [x] ArchiveAsset／RestoreAsset 與 RestoreRevision 形成 immutable、preflight-first、可 remediation 的復原閉環：已由合併 [PR #297](https://github.com/wahengchang/ai-study-note/pull/297)、完成 WI-021 與現行 `archive-restore-asset.test.ts`／`restore-revision.test.ts` 證明。

## Notes
2026-09-13 closeout traceability：上述五組證據覆蓋 #217 的十五項 user stories、implementation decisions 與 testing decisions；未發現 runtime 或 acceptance 缺口，WG-052 僅記錄既有交付的驗證與 Issue closeout。
