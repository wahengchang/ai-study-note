---
id: WI-005
status: done
title: CMS-BASIC-CONTRACTS-V1｜Plugin host core
work_group: WG-048
depends_on: ["WI-007"]
---

# CMS-BASIC-CONTRACTS-V1｜Plugin host core

## Outcome
完成 [GitHub Issue #218](https://github.com/wahengchang/ai-study-note/issues/218) 的核准結果。

## Acceptance traceability

- **discovery、trusted root 與 exact activation**：PR [#268](https://github.com/wahengchang/ai-study-note/pull/268)／WI-007 完成 canonical manifest identity、durable drift latch、explicit exact re-enable 與 immutable ordered validator snapshot；`plugin-host.test.ts`、`save-revision-plugin-composition.test.ts`；工作紀錄 `logs/2026-08-29-1419-plugin-lifecycle-integration.md`。
- **public snapshot 與 delivery 邊界**：PR [#324](https://github.com/wahengchang/ai-study-note/pull/324) 將 ThemeHost/PluginHost exact identity 接入 sealed public renderer snapshot，保留 verified callback/delivery provenance。
- **CMS editor integration**：PR [#334](https://github.com/wahengchang/ai-study-note/pull/334) 透過 Application 與 exact authenticated API 選取 active output；inactive、missing、identity-changed 保留 source 與 Host diagnostic；`cms-editor-block-resolutions.test.ts`、`plugin-editor-blocks.test.ts`；工作紀錄 `logs/2026-09-09-1736-cms-plugin-editor-integration.md`。
- **整體交叉驗證**：2026-09-12 的四個 core domain suite 97/97 通過，含 trusted-root replacement、identity drift、callback sanitization、CAS conflict、one-shot token 與 public snapshot stale rejection。上述 acceptance 已完整覆蓋，未發現需新開 Work Item 的缺口。

## Notes

GitHub #218 已完成；本 Cycle 可識別的直接依賴為 WI-007；後續 public/CMS integration 以已合併 PR #324、#334 與其工作紀錄追溯。
