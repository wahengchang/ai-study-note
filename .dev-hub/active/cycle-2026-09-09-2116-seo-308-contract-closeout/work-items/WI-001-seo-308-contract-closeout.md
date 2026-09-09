---
id: WI-001
status: done
title: SEO-308 contract closeout
work_group: WG-001
depends_on: []
---

# SEO-308 contract closeout

## Outcome
現行 `site-reset` 的 #308 production SEO flow 會在 migration、settings admission、analysis admission 與 public robots output 均符合核准 contract。

## Acceptance
`db:migrate` reconcile exact `site-content@1` evidence；analysis 在 Plugin callback 前驗 current baseline 並經 SiteDefinition 產生 canonical URL；settings 僅接受 canonical HTTPS public base；`indexing` 進入 sealed public evidence，並使 `robots.txt` 精確輸出 allow 或 disallow。新增契約測試，完整 check 與真實 production flow 均通過。

## Notes
PR #331 已於 2026-09-09 關閉為 superseded；current `site-reset` 的共同缺口已以 migration/schema、Application admission、canonical settings 與 public indexing 修正，`npm run check`（250 tests）及 production CLI smoke 均通過。