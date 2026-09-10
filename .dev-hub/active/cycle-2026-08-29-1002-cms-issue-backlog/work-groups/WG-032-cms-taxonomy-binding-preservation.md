---
id: WG-032
status: completed
title: CMS taxonomy binding preservation
work_items: ["WI-066"]
owner: Main
branch: fix/cms-taxonomy-binding-preservation
worktree: /Volumes/UGREEN 2TB /projects/ai-study-note-reset/.dev-hub/worktrees/cms-taxonomy-binding-preservation
pr: https://github.com/wahengchang/ai-study-note/pull/353
---

# CMS taxonomy binding preservation

## Delivery

在 Taxonomy selector 尚未實作前，CMS 從 `AuthoringEntryV1.current.taxonomyBindings` 導出 exact identity，於既有 entry 的 SaveRevision request 原樣保留；不新增 CMS taxonomy UI、document route 或 current catalog fallback。

## Verification

reviewer 與 security-reviewer 均確認唯一 integrity blocker 是 CMS 固定送空陣列；`AuthoringEntryV1` 只投影 fresh exact `{taxonomyId,termId}` state，strict transport、Application CAS 與 Taxonomy transaction 繼續處理 malformed／stale identity 的 zero-write failure。成功 reload 才替換 document、baseline 與 identities 並解除 conflict，未加入 selector、catalog fallback 或 evidence 回送。

`npm run typecheck`、`npm run cms:build`、`npm run check:architecture`、`git diff --check` 通過。`node --import tsx --test-concurrency=1 --test tests/apps/cms/runtime-browser-gate.test.ts` 四項 real `startCmsRuntime` Chromium browser/a11y journeys 全數通過；新增旅程以外部 CAS 更新製造 409，reload 後由 CMS 儲存並發布，持久化直接驗證 current／published revisions 均保有相同 `topics/beta` immutable evidence 與 digest。
