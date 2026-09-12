---
id: WG-045
status: completed
title: CMS release diagnostics workspace
work_items: ["WI-061"]
owner: Main
branch: wg-045-release-diagnostics
worktree: /Volumes/UGREEN 2TB /projects/ai-study-note-reset/.dev-hub/worktrees/wg-045-release-diagnostics
pr: null
---

# CMS release diagnostics workspace

完成：`/cms/release` diagnostics 已交付；PR 待建立。

## Verification

- `npm run cms:build`
- `node --import tsx --test --test-concurrency=1 --test-name-pattern='release diagnostics' tests/apps/cms/runtime-browser-gate.test.ts`：1/1 通過。
- `npm run typecheck`

