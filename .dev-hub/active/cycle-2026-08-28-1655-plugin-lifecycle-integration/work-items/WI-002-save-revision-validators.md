---
id: WI-002
status: done
title: SaveRevision validator snapshots
work_group: WG-001-plugin-lifecycle-integration
depends_on:
  - WI-001
---

# Outcome

由 PluginHost 建立 one-shot、same-host、same-entry 的 SaveRevision validator operation snapshot，依 priority 再 Plugin ID 執行並只允許 content replacement。

# Acceptance

- prepare 僅讀一次 activation state、先驗證所有 active identity，callback 前 fail closed。
- token 不可跨 host、錯 entry 或重播；所有 callback failure 都停止後續 callback 並回 sanitized failure。
- callback 只取得 immutable input 與 zero-service facade，不能取得 lifecycle mutation 或 persistence handle。

# Notes
對應 GitHub #234。
完成 two-phase evidence-before-import validator snapshot、immutable replacement chain、same-host／same-entry one-shot token 與 sanitized validator diagnostic。驗證：`node --import tsx --test tests/core/plugin-host/plugin-host.test.ts tests/core/application/save-revision.test.ts tests/core/application/save-revision-failures.test.ts`（18 pass）及 `npm run check`（94 pass）。
