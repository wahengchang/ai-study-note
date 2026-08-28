---
id: WG-001
status: completed
title: 漸進式專案文件導入
work_items:
  - WI-001
owner: Codex
branch: docs/progressive-project-documentation
worktree: /Volumes/UGREEN 2TB /projects/ai-study-note-reset/.dev-hub/worktrees/progressive-project-documentation
pr: null
---

# 漸進式專案文件導入

## Delivery

- 新增 `docs/INDEX.md`。
- 更新 `.rulesync/rules/CLAUDE.md` 並生成根目錄 AI 指令輸出。

## Verification

- `npm run sync:ai`：exit 0，生成根目錄 `AGENTS.md` 與 `CLAUDE.md`。
- `npm run check:ai-sync`：exit 0，Rulesync 無 drift。
- AI 文件 section count command：exit 0；canonical source、`AGENTS.md`、`CLAUDE.md` 各為一次。
- 本地 Markdown link command：exit 0；verified 70 local links。
- 範本殘留 command：exit 0。
- 逐列走讀九項任務與九個 domain 路由：Persistence migration 在單列到達 `CMS-DB-01`、Persistence public entry、SQL migrations 與三個 Persistence tests；Site Definition 到達 `CMS-CORE-03` 並標示尚無程式與測試入口；AI 指令先到 Rulesync canonical source，不把 generated `AGENTS.md` 當真源。
- `npm run check`：exit 0；typecheck、architecture checker 與 Node test suite 全部通過（51 passed、0 failed）。
