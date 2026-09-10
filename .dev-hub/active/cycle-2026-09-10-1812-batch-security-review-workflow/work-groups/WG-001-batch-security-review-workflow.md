---
id: WG-001-batch-security-review-workflow
status: completed
title: 交付集中安全審查流程
work_items:
  - WI-001-batch-security-review-workflow
owner: OpenAI Codex
branch: workflow/batch-security-review
worktree: /Volumes/UGREEN 2TB /projects/ai-study-note-reset/.dev-hub/worktrees/batch-security-review-workflow
pr: null
---

## Delivery

更新 Dev Hub workflow 與三個 Rulesync canonical 來源，執行同步並交付生成指令輸出。

## Verification

- `npm run sync:ai`：成功；生成 3 個 rules、4 個 skills、1 個 subagent，共 8 個輸出。
- `npm run check:ai-sync`：成功，`✓ All files are up to date.`。
- 同步後直接檢查 canonical 與 generated routing：`security-reviewer` 僅保留 Owner 明確要求或 bounded Cycle final closeout；root `AGENTS.md`／`CLAUDE.md`、三個 `do-work` generated skills 與 `.codex/agents/public-delivery-engineer.toml` 均反映新規則，public-delivery 不含 per-change trigger。
- fresh read-only `PacketSecurityWorkflowReader` 只依同步後的 canonical rule packet 判定五種情境：小型無 Cycle auth fix 不呼叫 specialist；非安全 core bounded Cycle 保留兩個非 security 角色預審並 closeout `not-required`；兩個 Host／Origin、Plugin trust-root PR 僅由 final Work Group 以兩個精確 heads 建一包並初始審查一次；finding head delta 由同一 reviewer session 只重查未結／新增 delta；umbrella 未認領 boundary Work Item 先移轉新 bounded Cycle、取消原項目且保留既有 provenance。public-delivery 已只指向 final closeout gate。
- 本 Cycle 只改協作流程與 agent 文件，未觸及七類產品安全邊界；`hub.md` Security Review 為 `not-required`，未呼叫 `security-reviewer`。
