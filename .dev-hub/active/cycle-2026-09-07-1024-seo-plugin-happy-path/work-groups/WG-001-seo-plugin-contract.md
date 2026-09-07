---
id: WG-001
status: completed
title: SEO Plugin contract
work_items: ["WI-001"]
owner: Main
branch: docs/seo-plugin-contract
worktree: .dev-hub/worktrees/seo-plugin-contract
pr: null
---

# SEO Plugin contract

## Delivery

將 #307 的完整 SEO cross-owner contract 與 Cycle tracking 交付為兩個 commit 的 reviewable PR；PR merge/close 後不再修改此 worktree。

## Verification

2026-09-07：`git diff --check` 通過；diff 僅含 `contracts/README.md` 與本 Cycle mandatory tracking。已依 Issue #307 與核准計畫核對 Content SEO、Save hard gate、Plugin catalog/settings、CMS analysis、prepared public snapshot、URL/binding、diagnostics、TSX architecture、authoring admission、Theme/Projection/Renderer/Delivery/CLI 與 observable matrix；runtime 尚未實作的目標已明標。
