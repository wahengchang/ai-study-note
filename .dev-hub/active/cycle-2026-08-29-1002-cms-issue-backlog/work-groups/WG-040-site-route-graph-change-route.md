---
id: WG-040
status: completed
title: Site route graph 與 ChangeRoute
work_items: ["WI-048"]
owner: Main
branch: wg-040-site-route-graph-change-route
worktree: /Volumes/UGREEN 2TB /projects/ai-study-note-reset/.dev-hub/worktrees/wg-040-site-route-graph-change-route
pr: https://github.com/wahengchang/ai-study-note/pull/366
---

# Site route graph 與 ChangeRoute

## Delivery

新增 Application 的同一 read snapshot graph façade與 wire proposal bridge，並以 finite authenticated `GET /v1/site/routes?selection=current|published`、`POST /v1/site/routes/change` 提供 exact DTO；HTTP 不取得 SiteDefinition 或 token，且 redaction 會破壞 digest-bound evidence 時在 command 前 fail-closed。

## Verification

`node --import tsx --test tests/core/application/change-route.test.ts tests/apps/authoring-api/http-contract.test.ts`：35/35 通過；`npm run typecheck`、`npm run check`（276/276）與 `git diff --check` 通過。實作前由 cms_workspace_engineer 與 data_media_engineer 職責交叉審查並 ACCEPT。
