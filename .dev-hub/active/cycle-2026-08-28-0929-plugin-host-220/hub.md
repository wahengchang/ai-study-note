---
id: cycle-2026-08-28-0929-plugin-host-220
status: completed
created_at: 2026-08-28T09:29:59+08:00
updated_at: 2026-08-28T09:42:16+08:00
---

# Plugin Host trusted activation

## Goal

完成 #220 的 repository-external trusted Plugin discovery、exact activation 與原子 active snapshot。

## Scope

- 建立 PluginHost public contract、固定去敏 failure 與 `plugin-manifest/v1` 驗證。
- 驗證 trusted installed root、transitive executable/resource evidence 與 validation-before-load。
- 以 durable activation-state port 實作顯式 activation、deactivation 與 active snapshot。
- 以 external OS-temp fixture 鎖定 public seam；建立 #220 完成後的 Application integration issue。

## Context

依 `contracts/README.md` §4、§5 與核准計畫 `local://plugin-host-220-plan.md` 執行。PluginHost 只依賴 Foundation；不實作 SaveRevision hook invocation、Application transaction、CMS inactive representation、renderer、HTTP/CLI 或 Persistence adapter。
