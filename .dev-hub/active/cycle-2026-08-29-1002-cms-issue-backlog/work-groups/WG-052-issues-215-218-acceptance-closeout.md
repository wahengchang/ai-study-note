---
id: WG-052
status: completed
title: Issues 215–218 acceptance closeout
work_items: ["WI-002", "WI-003", "WI-004", "WI-005"]
owner: Main
branch: chore/backlog-closeout-215-218
worktree: .dev-hub/worktrees/backlog-closeout-215-218
pr: null
---

# Issues 215–218 acceptance closeout

## Delivery

完成 #215、#216、#217、#218 的逐條 acceptance traceability。已合併 PR、完成 Work Item、現行 public seam 與 current-state verification 均有對應；未發現 runtime 或 acceptance 缺口，未建立新 Work Item。

## Verification

- `node --import tsx --test --test-concurrency=1 tests/core/application/save-revision.test.ts tests/core/application/save-revision-failures.test.ts tests/core/application/save-revision-media-replacement.test.ts tests/core/application/save-revision-plugin-composition.test.ts tests/core/application/publish-revision.test.ts tests/core/application/restore-revision.test.ts tests/core/application/change-route.test.ts tests/core/site-definition/current-route-claim.test.ts tests/core/site-definition/published-route-claim.test.ts tests/core/site-definition/route-claim-replacement.test.ts tests/core/media/local-import.test.ts tests/core/media/published-selection.test.ts tests/core/media/archive-restore-asset.test.ts tests/core/media/startup-reconciliation.test.ts tests/core/plugin-host/plugin-host.test.ts`：81 pass。
- `node --import tsx --test --test-concurrency=1 tests/core/plugin-host/plugin-host.test.ts tests/core/plugin-host/locale-determinism.test.ts tests/core/plugin-host/public-build-snapshot.test.ts tests/core/plugin-host/seo-analysis.test.ts`：24 pass。
- `npm run check`：typecheck、architecture checker、CMS build 與 288 tests 通過。
- `npm run dev-hub:overview:check`：通過。
- GitHub API：PR #248、#263、#268、#273、#274、#295、#296、#297、#298、#303、#324、#334 均為 MERGED。
