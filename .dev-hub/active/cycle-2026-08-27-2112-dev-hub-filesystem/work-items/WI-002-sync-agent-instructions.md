---
id: WI-002
status: done
title: 同步代理指令文件
work_group: WG-001
depends_on:
  - WI-001
---

# Outcome

`AGENTS.md` 與 `CLAUDE.md` 由 Rulesync 單一來源生成，逐字包含相同的大型工作觸發條件與 `docs/dev-hub-workflow.md` 引用入口。

# Acceptance

- `npm run sync:ai` 成功生成代理指令文件。
- `npm run check:ai-sync` exit 0。
- `cmp AGENTS.md CLAUDE.md` exit 0，且兩檔都只保留完整、可用的 Dev Hub 引用入口。

# Notes

由 WG-001 單獨認領。已在 Node `24.20.0`、npm `11.19.0` 執行同步；`npm run check:ai-sync` 與 `cmp AGENTS.md CLAUDE.md` 均 exit 0，兩個生成檔的 Dev Hub 區段各由九個詳細規則縮減為一個入口。
