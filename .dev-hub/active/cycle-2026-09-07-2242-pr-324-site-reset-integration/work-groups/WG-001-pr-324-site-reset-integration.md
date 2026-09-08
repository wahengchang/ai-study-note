---
id: WG-001
status: completed
title: PR #324 site-reset 整合
work_items:
  - WI-001
owner: Main
branch: integration/pr-324-site-reset
worktree: .dev-hub/worktrees/pr-324-site-reset-integration
pr: null
base: docs/theme-plugin-lifecycle-compatibility
---

# PR #324 site-reset 整合

## Delivery

以 target seam 優先的三方語意整合，包含程式、測試、契約、文件與 Dev Hub 修正。

## Verification

Node v24.20.0／npm 11.19.0 下 `npm ci` 成功；`npm run check` 成功：TypeScript、architecture、CMS Vite build 與 216 個測試全數通過。另已實測 Public UI verified snapshot、Renderer/Delivery atomic redelivery、Plugin sealed public renderer snapshot、CMS pagehide exchange abort、Theme artifact rendering。
