---
id: WI-004
status: done
title: CMS-BASIC-CONTRACTS-V1｜媒體生命週期 application core
work_group: WG-048
depends_on: ["WI-010", "WI-013", "WI-014", "WI-019", "WI-020", "WI-021"]
---

# CMS-BASIC-CONTRACTS-V1｜媒體生命週期 application core

## Outcome
完成 [GitHub Issue #217](https://github.com/wahengchang/ai-study-note/issues/217) 的核准結果。

## Acceptance traceability

- **import 與 immutable reference evidence**：PR [#248](https://github.com/wahengchang/ai-study-note/pull/248)／WI-010、WI-014 將本機 bytes 驗證後建立 ready version 與 revision reference；`local-import.test.ts`、`pointer-lineage.test.ts`。
- **startup reconciliation**：PR [#298](https://github.com/wahengchang/ai-study-note/pull/298)／WI-013 對 stage-only、final-only、crash pair、orphan 與 missing bytes 進行 idempotent fail-closed 收斂；`startup-reconciliation.test.ts`；工作紀錄 `logs/2026-09-01-1645-data-media-startup-reconciliation.md`。
- **reference replacement、archive 與 restore**：PR [#296](https://github.com/wahengchang/ai-study-note/pull/296)／WI-019 保留 immutable source 與 published pin；PR [#297](https://github.com/wahengchang/ai-study-note/pull/297)／WI-021 處理 archive/recovery 與 physical evidence；`save-revision-media-replacement.test.ts`、`archive-restore-asset.test.ts`。
- **published selection**：PR [#295](https://github.com/wahengchang/ai-study-note/pull/295)／WI-020 僅自 published pointer 解析完整 verified ready selection；`published-selection.test.ts`。
- **整體交叉驗證**：2026-09-12 的四個 core domain suite 97/97 通過，含 promotion fault、重試、checksum/metadata mismatch、canonical digest 不變與 published reference gate。上述 acceptance 已完整覆蓋，未發現需新開 Work Item 的缺口。

## Notes

GitHub #217 已完成；實際依賴為 WI-010、WI-013、WI-014、WI-019、WI-020、WI-021。
