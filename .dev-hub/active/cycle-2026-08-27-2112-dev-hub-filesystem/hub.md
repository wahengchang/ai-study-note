---
id: cycle-2026-08-27-2112-dev-hub-filesystem
status: completed
created_at: 2026-08-27T21:12:00+08:00
updated_at: 2026-08-27T21:33:24+08:00
---

# Goal

將 Dev Hub 大型工作檔案系統正式導入專案，以可提交的 active Cycle 管理進行中狀態，並將完成歷史收斂至 `logs/`。

# Scope

- 在 `docs/dev-hub-workflow.md` 以漸進揭露集中 Cycle、Work Item、Work Group 的完整流程。
- 將 `MEMORY.md`、Rulesync 規則來源與生成檔縮減為觸發條件和單一引用入口，並更新 Git ignore 邊界。
- 以 WG-001 的恰好兩個 commit 交付規則完成本 Cycle。

# Context

`contracts/README.md` 仍是 CMS／renderer implementation contract SSOT；Dev Hub 僅管理大型工作的執行與交付狀態。既有 `dev-hub-*/` handoff artifact 繼續視為唯讀歷史資料，與現行 `.dev-hub/` 狀態中心分離。
