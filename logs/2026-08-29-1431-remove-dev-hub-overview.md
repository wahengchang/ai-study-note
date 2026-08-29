# 移除 Dev Hub overview

- **來源**：PR #269（`remove-dev-hub-overview`），非 Cycle 內工作，未建立 Work Group
- **完成時間**：2026-08-29T14:31:00+08:00
- **狀態**：completed

## 交付

- 刪除 `.dev-hub/overview/` 的三份已提交 snapshot：`index.html`、`issues.json`、`links.json`；`.dev-hub/overview/` 目錄不再存在。
- 刪除 renderer `scripts/render-dev-hub-overview.ts` 與其契約測試 `tests/scripts/render-dev-hub-overview.test.ts`（`tests/scripts/` 隨之清空）。
- 移除 `package.json` 的 `dev-hub:overview` 與 `dev-hub:overview:check` script；`npm run check` 組成不變。
- `docs/dev-hub-workflow.md` 移除整節「本地專案總覽 projection」，並將 Work Item schema 說明由 `work_group` 與 overview link 的 `work_group_id` 收斂為僅 `work_group`。
- `docs/INDEX.md` 的「延續大型工作」與「目前工作」改為直接進入 `.dev-hub/active/` 對應 Cycle 的 `hub.md` 與連結狀態，不再以 overview HTML 作為入口。

## 關鍵決策

- 導覽 SSOT 回到 `.dev-hub/active/` 的 Cycle／Work Item／Work Group canonical state；不以另一份 projection 取代被刪除的 overview。
- 保留 `.dev-hub/active/cycle-2026-08-29-1002-cms-issue-backlog/work-groups/WG-001-planned-backlog-onboarding.md` 中提及已刪除 script 的 `Verification` 原文。該 Work Group 為 `completed`，其 Verification 是當時實際執行結果的 provenance 紀錄，改寫會偽造歷史。
- `logs/` 內既有紀錄同樣保留 overview 相關敘述，理由同上。

## 實際驗證

Node `24.20.0`（`npx --yes node@24.20.0`）、依 `package-lock.json` 安裝：

- `tsc --noEmit`：通過，無 diagnostics。
- `node --import tsx scripts/check-architecture.ts`：通過。
- `node --import tsx --test "tests/**/*.test.ts"`：75 tests、75 pass、0 fail。
- 殘留參照檢查：`git grep` 於 `.dev-hub/overview`、`dev-hub:overview`、`render-dev-hub-overview`、`issues.json`、`links.json`、`work_group_id` 於 `logs/` 與唯讀歷史目錄之外均無命中；唯一例外為上述刻意保留的 WG-001 `Verification`。
- 相依檢查：被刪除的 renderer 只 import `node:fs/promises`、`node:path`、`node:url`，未造成 `package.json` 產生孤兒相依；`es-module-lexer`、`json-canonicalize`、`semver`、`unicode-case-folding` 仍各有現行使用者。

## 已知限制／後續

- 三筆仍為 open 的追蹤項目其交付標的正是本次刪除的機制，需 Owner 決定取消或重新定義後才會一致：
  - [GitHub Issue #262](https://github.com/wahengchang/ai-study-note/issues/262)（可重用 Issue／Dev Hub overview 機制），以及對應的 `WI-034-issue-262`，其 `status` 仍為 `pending`。
  - [GitHub Issue #260](https://github.com/wahengchang/ai-study-note/issues/260)（overview 固定暗色主題與依賴圖 View），其 acceptance 直接要求 `npm run dev-hub:overview` 與 renderer 契約測試。
  - [GitHub Issue #261](https://github.com/wahengchang/ai-study-note/issues/261) 的範圍以 overview schema v3 描述；`WI-033` 已為 `done`，Issue 本身仍為 open。
- 本 PR 不改動 GitHub Issue 狀態，也不變更任何 Work Item `status`；上述一致性收斂留待 Owner 決策。

## 相關 Branch／PR

- Branch：`remove-dev-hub-overview`（base：`site-reset`）
- PR：https://github.com/wahengchang/ai-study-note/pull/269
