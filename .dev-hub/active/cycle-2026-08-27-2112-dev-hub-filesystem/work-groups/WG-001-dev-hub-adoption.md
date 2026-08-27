---
id: WG-001
status: completed
title: 導入 Dev Hub 大型工作檔案系統
work_items:
  - WI-001
  - WI-002
owner: wahengchang
branch: chore/dev-hub-filesystem
worktree: .
pr: null
---

# Delivery

以 `chore/dev-hub-filesystem` 疊加於 `site-reset`，交付 `docs/dev-hub-workflow.md` 單一流程文件、精簡引用入口、Git ignore 邊界與完成紀錄。

# Verification

- Node `24.20.0`、npm `11.19.0`：`npm run sync:ai` 成功生成規則。
- `npm run check:ai-sync`：exit 0，Rulesync 回報所有檔案已同步。
- `cmp AGENTS.md CLAUDE.md`：exit 0；兩個生成檔的 Dev Hub 區段各由九個詳細規則縮減為一個觸發條件與 `docs/dev-hub-workflow.md` 入口，完整流程仍涵蓋命名、狀態、兩個 commit 與 closeout 規則。
- `git check-ignore -q`：`worktrees/probe` 與 `runtime/probe` exit 0，`active/probe` exit 1。
