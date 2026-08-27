---
id: WI-001
status: done
title: 定義 Dev Hub 大型工作政策
work_group: WG-001
depends_on: []
---

# Outcome

專案以 `docs/dev-hub-workflow.md` 作為唯一且一致的 Dev Hub 操作入口，並以漸進揭露呈現持久化邊界、流程與完成條件。

# Acceptance

- `.gitignore` 提交 `.dev-hub/active/`，並忽略 `.dev-hub/worktrees/` 與 `.dev-hub/runtime/`。
- `docs/dev-hub-workflow.md` 完整定義 schema、關聯、狀態、兩個 commit 與 closeout 規則。
- `MEMORY.md` 與 Rulesync 根規則來源只保留觸發條件、引用入口及 `contracts/README.md` 權威邊界。

# Notes

由 WG-001 單獨認領。已建立 `docs/dev-hub-workflow.md`，並將 `.gitignore`、`MEMORY.md` 與 Rulesync 根規則來源收斂為必要邊界和引用入口；ignore probe 與規則內容檢查均通過。
