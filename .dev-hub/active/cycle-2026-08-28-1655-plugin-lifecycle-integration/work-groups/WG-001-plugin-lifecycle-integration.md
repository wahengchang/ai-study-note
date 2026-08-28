---
id: WG-001-plugin-lifecycle-integration
status: completed
title: Plugin lifecycle integration
work_items:
  - WI-001
  - WI-002
  - WI-003
owner: Main
branch: cms/plugin-lifecycle-integration
worktree: .dev-hub/worktrees/plugin-lifecycle-integration
pr: null
---

# Delivery

交付 activation state durable CAS、PluginHost v2 lifecycle／editor-block／validator snapshot，以及 async SaveRevision composition、migration、契約測試與文件更新。

# Verification

`node --import tsx --test "tests/core/persistence/*.test.ts"`：10/10 通過。
`node --import tsx --test "tests/core/plugin-host/*.test.ts"`：8/8 通過。
`node --import tsx --test "tests/core/application/*.test.ts"`：6/6 通過。
`npm run check`：62/62 通過。
`npm run check:ai-sync`：通過。