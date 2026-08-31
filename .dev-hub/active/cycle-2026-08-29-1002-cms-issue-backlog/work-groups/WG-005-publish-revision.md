---
id: WG-005-publish-revision
status: completed
title: 發布呼叫端確認的 current revision
work_items:
  - WI-018
owner: Main
branch: cms/publish-revision
worktree: .dev-hub/worktrees/publish-revision
pr: https://github.com/wahengchang/ai-study-note/pull/274
---

# 發布呼叫端確認的 current revision

## Delivery

依 Owner 核准的 forward reconciliation 刪除過早的 WG-004 completion log，補正其 merged #273 實際交付與驗證，並記錄歷史三提交 nonconformance 的單次 waiver。`DomainApplication.publishRevision` 驗證呼叫端的 current revision、schema、媒體與 published route proposal；成功僅原子更新 published pointer／claim 與 `createsRevision: false` lineage。

## Verification

`node --import tsx --test tests/core/application/publish-revision.test.ts`（3 pass）、`node --import tsx --test "tests/core/application/*.test.ts"`（13 pass）與 `npm run check`（112 pass）通過。成功與同 route re-publish 驗證 current graph 不變、published claim attribution 更新與 non-revision lineage；mismatch、schema、media、route、stale proposal rejection 均驗證 canonical state digest 不變。
