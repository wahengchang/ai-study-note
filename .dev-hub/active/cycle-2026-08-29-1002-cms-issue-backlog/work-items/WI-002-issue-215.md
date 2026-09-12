---
id: WI-002
status: done
title: CMS-BASIC-CONTRACTS-V1｜內容生命週期 application core
work_group: WG-048
depends_on: ["WI-015", "WI-018", "WI-022", "WI-023"]
---

# CMS-BASIC-CONTRACTS-V1｜內容生命週期 application core

## Outcome
完成 [GitHub Issue #215](https://github.com/wahengchang/ai-study-note/issues/215) 的核准結果。

## Acceptance traceability

- **SaveRevision 與 immutable current lifecycle**：PR [#248](https://github.com/wahengchang/ai-study-note/pull/248)／WI-015 建立 schema、media、route preflight 與 current pointer 的單一 transaction；`tests/core/application/save-revision*.test.ts` 覆蓋成功、stale、route、media 與 rollback；工作紀錄 `logs/2026-08-28-1114-save-revision-foundation.md`、`2026-08-28-1205-save-revision-review-fixes.md`。
- **PublishRevision**：PR [#274](https://github.com/wahengchang/ai-study-note/pull/274)／WI-018 只移動 published selection，保留 current 與 non-revision lineage；`publish-revision.test.ts` 驗證 stale、schema、media、route gate。
- **RestoreRevision**：PR [#297](https://github.com/wahengchang/ai-study-note/pull/297)／WI-022 從 immutable source 產生新 current、保留 published pin，並在 archived/missing media 時 zero mutation；`restore-revision.test.ts`；工作紀錄 `logs/2026-08-31-1754-archive-restore-revision.md`。
- **ChangeRoute**：PR [#303](https://github.com/wahengchang/ai-study-note/pull/303)／WI-023 在 digest-bound proposal 的單一 transaction 套用 claim，無 revision/pointer move；`change-route.test.ts`；工作紀錄 `logs/2026-09-03-1402-change-route.md`。
- **整體交叉驗證**：2026-09-12 執行 `tests/core/application/*.test.ts`、`tests/core/site-definition/*.test.ts`、`tests/core/media/*.test.ts`、`tests/core/plugin-host/*.test.ts`，97/97 通過。上述 acceptance 已完整覆蓋，未發現需新開 Work Item 的缺口。

## Notes

GitHub #215 已完成；實際依賴為 WI-015、WI-018、WI-022、WI-023。
