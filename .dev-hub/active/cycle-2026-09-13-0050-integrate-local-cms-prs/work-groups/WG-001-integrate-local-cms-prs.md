---
id: WG-001
status: completed
title: 整合仍有效的 local CMS PR
work_items: ["WI-001"]
owner: Main
branch: integrate/local-cms-prs
worktree: /Volumes/UGREEN 2TB /projects/ai-study-note-reset
pr: null
---

# 整合仍有效的 local CMS PR

## Delivery
整合 #361、#364、#368：repository-external local CMS init/start/kill、direct-browser CMS 與 same-machine anonymous `/v1`、CMS document/asset admission，以及跟隨該模式的 browser/HTTP/CLI 測試。#366 已由 WG-045 取代，未整合。

## Verification
`npm run typecheck` 通過；`node --import tsx --test tests/apps/cli/cms-local-cli.test.ts tests/apps/cli/cms-kill-cli.test.ts tests/apps/authoring-api/http-contract.test.ts` 通過 41/41。以 isolated `HOME` 執行 `npm run cms:init`，實際完成 build、migration、plugin/theme package 與 activation；`npm run cms:start` 實際監聽 `127.0.0.1:43127`，`GET /cms` 回傳 direct CMS loading shell，`npm run cms:kill` 實際回報 `stopped=1` 並結束 listener。browser automation 兩次逾時，未將其視為 UI 視覺驗證。