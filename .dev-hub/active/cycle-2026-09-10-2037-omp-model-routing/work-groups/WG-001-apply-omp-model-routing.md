---
id: WG-001
status: completed
title: 套用 OMP 模型路由
work_items:
  - WI-001
owner: Main
branch: chore/reviewer-model
worktree: /Volumes/UGREEN 2TB /projects/ai-study-note-reset
pr: null
---

# 套用 OMP 模型路由

## Delivery

更新全域與專案 OMP 路由、DeepSeek reviewer、canonical rule 與生成 AI 指令。

## Verification

`npm run sync:ai` 已重建三個 skill 與三個 rule；`npm run check:ai-sync` 通過。
`omp config get task.agentModelOverrides --json` 解析出原生 reviewer 為 `openai-codex/gpt-5.6-sol:xhigh`、DeepSeek reviewer 為 `opencode-go/deepseek-v4-flash:high`、security reviewer 為 `@slow`；`omp config get modelRoles --json` 將 `slow` 解析為 `openai-codex/gpt-6-astra:xhigh`。