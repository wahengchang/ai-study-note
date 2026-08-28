---
id: cycle-2026-08-28-1157-progressive-project-documentation
status: completed
created_at: 2026-08-28T11:57:37+08:00
updated_at: 2026-08-28T12:01:29+08:00
---

# 漸進式專案文件導入

## Goal

建立以任務與 domain 導航的專案文件入口，並讓 AI 指令從 canonical Rulesync source 導向該入口。

## Scope

- 新增 `docs/INDEX.md`，只連結現行權威文件、真實 public source 與實際測試。
- 在 `.rulesync/rules/CLAUDE.md` 新增專案文件指令，透過 Rulesync 生成根目錄 AI 指令。
- 驗證連結、Rulesync 同步與完整既有檢查。

## Context

`contracts/README.md` 是唯一 implementation SSOT。Downloads 中的文件只作外部輸入，不納入 repository。此 Cycle 只管理本文件導入工作，不修改其他 active Cycle。
