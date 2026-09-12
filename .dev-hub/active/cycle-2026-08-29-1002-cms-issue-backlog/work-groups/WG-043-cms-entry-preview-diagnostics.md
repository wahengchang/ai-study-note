---
id: WG-043
status: completed
title: CMS entry preview diagnostics
work_items: ["WI-060"]
owner: Main
branch: wg-043-cms-entry-preview-diagnostics
worktree: /Volumes/UGREEN 2TB /projects/ai-study-note-reset/.dev-hub/worktrees/wg-043-cms-entry-preview-diagnostics
pr: 371
---

# CMS entry preview diagnostics

完成：entry editor 的 preview diagnostics 已由 PR #371 交付。

## Verification

- `npm run cms:build`
- `node --import tsx --test tests/apps/cms/article-workspace.test.ts`：1/1 通過；實際 Chromium 驗 current/published/未發布/safe-error、iframe sandbox、keyboard tab 與窄 viewport。
- `npm run typecheck`

