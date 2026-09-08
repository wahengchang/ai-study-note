---
id: cycle-2026-09-07-2242-pr-324-site-reset-integration
status: active
created_at: 2026-09-07T22:42:54+08:00
updated_at: 2026-09-08T09:32:07+08:00
---

# PR #324 site-reset 整合

## Goal

以 `site-reset` 為目標分支，語意整合 PR #324 的累積交付，保留既有 ThemeHost、Projection、Persistence、SiteDefinition、Media 與 PluginHost 安全 seam。

## Scope

整合 Deterministic Public Delivery、Structured Content Read Model、Preview Core Document、Local Public UI、CMS workspace router 與 CMS browser bootstrap；修正完整性、安全性、契約、文件與測試問題。production `cms:serve`、`cms:open` flags、public media emission、GitHub Pages/release 不在範圍內。

## Context

輔助 PR 固定以 `docs/theme-plugin-lifecycle-compatibility` 為 base；本 Cycle 的唯一 Work Group 使用 `integration/pr-324-site-reset` 與隔離工作樹，根工作樹維持不動。
