---
id: WG-041
status: completed
title: Content Type migration
work_items: ["WI-042"]
owner: Main
branch: wg-041-content-type-migration
worktree: /Volumes/UGREEN 2TB /projects/ai-study-note-reset/.dev-hub/worktrees/wg-041-content-type-migration
pr: https://github.com/wahengchang/ai-study-note/pull/369
---

# Content Type migration

完成：Content Type migration 已由 PR #369 交付。固定 Authoring API listener 已恢復可用；migration-specific preview 與 execution actual-listener regression 通過。

## Verification

- `npm run typecheck`
- `node --import tsx --test tests/core/persistence/schema-migration-execution.test.ts`：6/6 通過。
- `node --import tsx --test tests/apps/authoring-api/http-contract.test.ts`：27/27 通過；包含 fixed-origin actual listener 的 migration preview 與 execution。
