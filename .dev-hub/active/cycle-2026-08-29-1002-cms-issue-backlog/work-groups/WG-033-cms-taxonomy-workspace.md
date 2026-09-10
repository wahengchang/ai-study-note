---
id: WG-033
status: completed
title: CMS taxonomy administration workspace
work_items: ["WI-057"]
owner: Main
branch: feature/cms-taxonomy-workspace
worktree: /Volumes/UGREEN 2TB /projects/ai-study-note-reset/.dev-hub/worktrees/cms-taxonomy-workspace
pr: https://github.com/wahengchang/ai-study-note/pull/354
---

# CMS taxonomy administration workspace

## Delivery

以既有 Application-only taxonomy transport 提供 `/cms/taxonomies`、`/cms/taxonomies/new`、`/cms/taxonomies/:taxonomyId` 的 list、create、detail UI，並將三個 route 以有限 exact allowlist 納入 CMS document admission 與 central logger。

## Verification

`npm run typecheck`、`npm run cms:build`、`npm run check:architecture`、`git diff --check` 通過。`node --import tsx --test-concurrency=1 --test tests/apps/cms/runtime-browser-gate.test.ts` 5/5 通過；新增 production-composition `startCmsRuntime` Chromium/a11y journey 以鍵盤完成 taxonomy empty list、create、detail 與 mobile layout，並驗證 exact routes。
