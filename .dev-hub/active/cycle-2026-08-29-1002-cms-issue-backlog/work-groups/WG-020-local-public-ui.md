---
id: WG-020
status: completed
title: Local Subpath-safe Public UI
work_items: ["WI-054"]
owner: Main
branch: feature/local-public-ui
worktree: .dev-hub/worktrees/local-public-ui
pr: https://github.com/wahengchang/ai-study-note/pull/312
---

# Local Subpath-safe Public UI

## Delivery

在已回收的 Preview baseline 上完成 default Theme、artifact verification seam 與本機 static artifact server；不實作 release 或 GitHub Pages。

## Verification

`npm run check` 通過（198 tests）；`tests/apps/public-ui/server.test.ts` 驗證固定子路徑、GET/HEAD、traversal 與 immutable snapshot；Chrome local demo 已實際顯示 `/ai-study-note/guide/` 的 default Theme、relative links 與語意地標。Release／GitHub Pages 依 Owner 決策不實作。
