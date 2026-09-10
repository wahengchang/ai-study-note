---
id: WG-031
status: completed
title: Taxonomy administration
work_items: ["WI-043"]
owner: Main
branch: feature/taxonomy-administration
worktree: /Volumes/UGREEN 2TB /projects/ai-study-note-reset/.dev-hub/worktrees/taxonomy-administration
pr: null
---

# Taxonomy administration

## Delivery

依 #291 Taxonomy contract 與既有 External Authoring API v1 seam，實作 Taxonomy definition／term lifecycle、immutable revision binding、current/published impact 與有限 `/v1/taxonomies` transport；不建立 CMS UI。

## Verification

`npm run check` 通過：TypeScript typecheck、architecture checker、CMS production build 與 260 tests 全數通過。另以 `tests/core/taxonomy/administration.test.ts`、`tests/core/persistence/revision-store.test.ts`、`tests/core/projection/strict-parse.test.ts` 驗證 immutable binding／usage impact／append-only migration／projection strict parsing；`tests/apps/authoring-api/http-contract.test.ts` 驗證有限 taxonomy transport 與 fail-closed status mapping。
