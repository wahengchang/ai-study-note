---
id: WG-026
status: completed
title: CMS canonical route accessibility gate
work_items: ["WI-063"]
owner: Main
branch: feature/cms-route-a11y-gate
worktree: /Volumes/UGREEN 2TB /projects/ai-study-note-reset/.dev-hub/worktrees/cms-route-a11y-gate
pr: null
---

# CMS canonical route accessibility gate

## Delivery

補齊 GitHub #315 四條 canonical route 的 action home、history route 與 a11y acceptance，僅在 `apps/cms` 和相應 browser tests 調整；保留既有 owner seam 與已交付 `/cms/plugins` management route。

## Verification

`npm run check` 於 2026-09-09 通過：typecheck、architecture check、CMS production build 與 251 tests。Chromium authenticated browser journey 驗證 `/cms` → `/cms/entries` → `/cms/entries/new` → `/cms/entries/:entryId`，主 heading skip focus、具名 main、Current／Published keyboard tabs、sandboxed preview iframe、Publish Escape／focus return／revision 說明、發布 status focus、375px 無水平 overflow 與 published-with-draft。
