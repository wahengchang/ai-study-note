---
id: WG-001
status: completed
title: SEO-308 contract closeout
work_items: ["WI-001"]
owner: Main
branch: fix/seo-308-contract-closeout
worktree: /Volumes/UGREEN 2TB /projects/ai-study-note-reset
pr: null
---

# SEO-308 contract closeout

## Delivery
以 current `site-reset` 修正 #308 的 schema migration、Application SEO admission、Plugin settings canonical URL admission 與 public indexing/robots seam；不合併或 cherry-pick 已關閉的 #331。

## Verification
`npm run check`：typecheck、architecture、CMS build、250 tests 通過。另以 `/tmp/seo-308-smoke.NdV46H` 執行真實 `plugin:package`、`theme:package`、`db:migrate`、`theme:activate` 與 `site:build`；migration 有 `site-content@1` exact schema evidence，site build 成功輸出 immutable artifact `sha256:3a2ed8d81c19c27e34f4c292192c4f4662e0e1843a3579975bc0b9e0d40fb90f`。