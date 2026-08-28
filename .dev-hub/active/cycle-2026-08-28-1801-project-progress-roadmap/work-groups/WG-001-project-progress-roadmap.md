---
id: WG-001-project-progress-roadmap
status: in_progress
title: Project progress roadmap
work_items:
  - WI-001
owner: domain_application_engineer
branch: chore/project-progress-roadmap
worktree: .dev-hub/worktrees/project-progress-roadmap
logical_pr_unit: cycle-2026-08-28-1801-project-progress-roadmap/WG-001
pr: https://github.com/wahengchang/ai-study-note/pull/258
---

# Delivery

建立 schema v2 manual overview JSON、遞迴 dependency closure、合併 Issue／Work Item dependency layout、單檔四視圖 HTML、named localStorage filters、join validation／輸出檢查與唯一維護規則；不存取或修改 GitHub Project 與 GitHub Issue。

# Verification

- `node --import tsx --test tests/scripts/render-dev-hub-overview.test.ts`：12 個測試通過，涵蓋 11-Issue closure、七階段 layout、合併 cycle、錯誤 PR URL、同 Cycle 多 Work Group 分卡、escaping、deterministic render 與 `--check`。
- `npm run dev-hub:overview` 與 `npm run dev-hub:overview:check`：通過。
- Chrome isolated `file://` review：1440px 預設為五欄表格、controls 收合、4/7/2 chips 與 `PR #258` link；建立 `Plugin 待處理` named filter、顯示 Cycle 欄、切換依賴 View 後 reload，View／欄位／filters／preset／controls state 全數由 localStorage 還原，且 #234/#246 保留 #239→#246 的必要前置脈絡。
- 清除 filters 後確認七階段與獨立 #252、兩張 Cycle cards（Plugin 1 active/2 pending、roadmap 1 active/0 pending）、status lanes `in_progress` #229/#252 與 `pending` #234/#246。390×844 mobile emulation 無 page horizontal overflow，只有 table／stage container 水平捲動；擷取寬版與窄版 screenshot 後已清除 isolated localStorage。
- `npm run check`（`typecheck` + `check:architecture` + 全量 `test`）：通過，74 個測試全數通過。先前記錄的 `unicode-case-folding` diagnostics 來自未安裝 dependencies 的環境，安裝後即不重現。