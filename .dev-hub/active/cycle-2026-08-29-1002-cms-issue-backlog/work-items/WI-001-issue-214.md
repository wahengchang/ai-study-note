---
id: WI-001
status: done
title: CMS-BASIC-CONTRACTS-V1｜資料持久化與 schema migration
work_group: WG-047
depends_on: ["WI-006", "WI-008", "WI-011", "WI-014", "WI-016"]
---

# CMS-BASIC-CONTRACTS-V1｜資料持久化與 schema migration

## Outcome
完成 [GitHub Issue #214](https://github.com/wahengchang/ai-study-note/issues/214) 的核准結果。

## Acceptance

- [x] Revision 的 immutable canonical bytes／digest、append-only schema history、去敏 failure 與失敗零寫入：已由合併 [PR #242](https://github.com/wahengchang/ai-study-note/pull/242)／[PR #243](https://github.com/wahengchang/ai-study-note/pull/243)、完成 WI-006 證明；現行 `migration-runner.test.ts`、`revision-store.test.ts`、`atomicity-and-failures.test.ts` 覆蓋，工作紀錄為 `logs/2026-08-27-1639-persistence-219.md` 與 `logs/2026-08-27-2032-persistence-219-hardening.md`。
- [x] 同 entry current／published pointer、composite integrity 與 operation lineage 的原子性：已由合併 [PR #248](https://github.com/wahengchang/ai-study-note/pull/248)、完成 WI-008 證明；現行 `pointer-lineage.test.ts` 與 `transaction-read-miss.test.ts` 覆蓋，工作紀錄為 `logs/2026-08-28-1114-save-revision-foundation.md`。
- [x] immutable revision-to-asset-version reference 與 reference fault 的整筆 rollback：已由合併 PR #248、完成 WI-014 證明；現行 `pointer-lineage.test.ts` 與 `atomicity-and-failures.test.ts` 覆蓋，工作紀錄為 `logs/2026-08-28-1114-save-revision-foundation.md`。
- [x] migration preflight 的完整 pointer／歷史／mapping／blocked-row report、opaque freshness evidence 與零寫入：已由合併 [PR #271](https://github.com/wahengchang/ai-study-note/pull/271)、完成 WI-011 證明；現行 `schema-migration-impact.test.ts` 覆蓋，工作紀錄為 `logs/2026-08-29-1641-schema-migration-impact.md` 與 `logs/2026-08-29-1829-schema-migration-impact-review.md`。
- [x] 僅從 fresh approvable report 執行、replacement revision 不改寫 source、明示 move/pin、durable lineage 與所有 reject/fault 零寫入：已由合併 [PR #272](https://github.com/wahengchang/ai-study-note/pull/272)、完成 WI-016 證明；現行 `schema-migration-execution.test.ts` 覆蓋，工作紀錄為 `logs/2026-08-29-2112-schema-migration-execution.md`。
- [x] Persistence 單一 public entry、跨 owner 不可直取內部與可雜湊 canonical snapshot：`core/persistence/index.ts` 為唯一 public entry；本次 `npm run check:architecture` 通過，以上現行 Persistence tests 對 digest／rollback 皆通過。

## Notes

2026-09-12 closeout traceability：上述五組證據完整覆蓋 #214 的十四項 user stories、implementation decisions 與 testing decisions；未發現 runtime 或 acceptance 缺口，故未建立新 Work Item。Work Group WG-047 僅記錄本次已合併交付的驗證與 Issue closeout。
