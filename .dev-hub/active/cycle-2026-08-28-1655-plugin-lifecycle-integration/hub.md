---
id: cycle-2026-08-28-1655-plugin-lifecycle-integration
status: active
created_at: 2026-08-28T16:55:15+08:00
updated_at: 2026-08-28T16:55:15+08:00
---

# Goal

完成 #229、#234、#246 的 Plugin lifecycle integration：durable activation CAS、exact re-enable lifecycle、SaveRevision validator snapshot 與真實 Application composition。

# Scope

- `WI-001`：#229 inactive／missing exact re-enable 與 CMS editor-block resolution。
- `WI-002`：#234 SaveRevision validators，依賴 `WI-001`。
- `WI-003`：#246 將單一 validator snapshot 接入 `DomainApplication.saveRevision`，依賴 `WI-001`、`WI-002`。
- migration `0007-add-plugin-activation-state`、對應 Persistence adapter、測試與核准文件同步。

# Context

實作基底是 `99c973d`，已包含 `da44b04` 的 SaveRevision foundation。僅使用 `.dev-hub/worktrees/plugin-lifecycle-integration`；既有 `.dev-hub/active/plugin-host-220/`、`database-contract-review/`、`api-contract-review/` 是使用者工作，不讀寫。