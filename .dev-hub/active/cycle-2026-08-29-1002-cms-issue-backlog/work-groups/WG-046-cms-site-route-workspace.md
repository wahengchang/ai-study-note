---
id: WG-046
status: completed
title: CMS Site route workspace
work_items: ["WI-059"]
owner: Main
branch: cms/site-route-graph
worktree: /Volumes/UGREEN 2TB /projects/ai-study-note-reset/.dev-hub/worktrees/wg-048-site-route-graph
pr: https://github.com/wahengchang/ai-study-note/pull/374
---

# CMS Site route workspace

GitHub #318。直接 workspace 讀取隔離 current/published route graph，並只經 proposal/command API 變更既有 claim；不增加 production nav 或 entry history。

## Verification

- `npm run check`：typecheck、architecture、CMS build 與 282 個測試全部通過。
- Chromium browser journey：驗證 direct workspace、focusable heading、skip link、empty/graph table、成功變更、stale safe error 及不在 production nav。
