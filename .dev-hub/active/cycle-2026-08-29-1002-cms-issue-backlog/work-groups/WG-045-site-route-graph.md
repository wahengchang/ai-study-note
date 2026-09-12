---
id: WG-045
status: completed
title: Site route graph API
work_items: ["WI-048"]
owner: Main
branch: cms/site-route-graph
worktree: /Volumes/UGREEN 2TB /projects/ai-study-note-reset/.dev-hub/worktrees/wg-048-site-route-graph
pr: https://github.com/wahengchang/ai-study-note/pull/374
---

# Site route graph API

完成 GitHub #288：新增 current／published graph 的精確 authenticated read、serializable proposal 與雙 digest ChangeRoute command；Application 重新簽發 opaque SiteDefinition proposal 後才進既有 transaction。

## Verification

- `npm run typecheck`：通過。
- `node --import tsx --test tests/core/application/change-route.test.ts tests/apps/authoring-api/http-contract.test.ts`：37/37 通過。
