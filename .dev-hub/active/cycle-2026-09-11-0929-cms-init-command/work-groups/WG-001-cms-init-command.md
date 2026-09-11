---
id: WG-001
status: completed
title: CMS local initialization commands
work_items: ["WI-001"]
owner: Main
branch: feat/cms-init
worktree: /Volumes/UGREEN 2TB /projects/ai-study-note-reset/.dev-hub/worktrees/cms-init
pr: null
---

# CMS local initialization commands

## Delivery

新增可重複的 `cms:init` 與 `cms:start`，封裝本機 demo runtime 的 build、migration、extension packaging、Theme activation、credential provisioning 與 server composition。

## Verification
`node --import tsx --test tests/apps/cli/cms-local-cli.test.ts` 2/2 通過；`npm run cms:init` 在 temporary HOME 完成 build、runtime 初始化與 credential provisioning；`npm run cms:start` 成功監聽 `http://127.0.0.1:43127`，以 CMS document navigation headers 請求 `/cms/plugins` 回應 200；`npm run check` 266/266 通過。Browser relay 未連線，無法以瀏覽器工具執行視覺驗證。
