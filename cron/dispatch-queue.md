---
title: Research & Writing Issue Dispatch Queue
---

> Kickoff artefact for `cron/git-auto.md`. Filters the open issue queue to research / writing tasks, assigns each to the agent from `claude/config.yaml`, and records current PR state so the worker can pick up the lowest-numbered unblocked issue.

## Scope filter

- **Include**: research notes, study notes, 技術評估 — 產出物落在 `content/`。
- **Exclude**: bug fixes, layout/template work, repo maintenance — 交由 `@content-ops` 或 site 維護流程處理。

## Audit snapshot（2026-04-14）

| # | Title（簡） | 類型 | Agent | 既有 PR | 下一步 |
|---|-------------|------|-------|---------|--------|
| #61 | 小紅書：自動優化提示詞開源項目 | Research | `@writer` | — | ⏸ `clarification_needed`（見 issue comment，需原作者提供 repo 線索） |
| #63 | 採用 Mintlify 作為新文件框架評估 | Research（框架評估） | `@writer` | #124 | skip — 已在 flight |
| #74 | Astron Agent / Serper / Jina / Python / LLM workflow 分工 | Writing | `@writer` | #155, #121 | skip — 已在 flight |
| #75 | raw / wiki 雙層 LLM 個人知識管理 | Research + Writing | `@writer` | #156, #120 | skip — 已在 flight |
| #76 | AI 自動生成 YouTube 影片 n8n workflow | Research + Writing | `@writer` | #154 | skip — 已在 flight |
| #77 | 終端多工 (cmux) × Claude Code 工作流 | Research + Writing | `@writer` | — | ✅ **dispatch next** |

非研究/寫作（排除本輪）：**#67**（文章標題重複 bug → `@content-ops` / Quartz layout）。

## Operational requirements per dispatchable issue

### #77 — Terminal multiplexer × Claude Code（next in queue）

- **Agent**: `@writer`（核心產出是研究筆記；無圖時不強制 `@diagram`）
- **來源確認**: 小紅書短連結 `http://xhslink.com/o/AAbGLpO7BY4` — 需先驗證 `cmux` 實指哪一個專案（常見混淆：`tmux`、`zellij`、`WezTerm mux`、或同名小眾 repo）。若短連結被登入牆擋住，依 git-auto.md 5 步驟：留 clarification comment、標 `clarification_needed`、停工。
- **研究面向**: tool identity → 與 `tmux` / `zellij` / `WezTerm` 的功能對比 → Claude Code 在 multi-pane / long-running session 的實務配置。
- **交付物**: `content/<topic>/<kebab-case>.md` 一篇；含 `title` frontmatter、工具對照表、最小可行 workflow、限制說明。
- **輸出位置建議**: `content/workflow-notes/terminal-multiplexing-claude-code.md`（若尚無 `workflow-notes/`，可放 `content/prompt-notes/` 或新建子目錄）。
- **驗收（from issue）**: 確認原內容工具身分、整理 ≥3 個可比較工具、輸出 1 套 Claude Code 實務 workflow、標註限制。

### #61 — Prompt optimization open-source project（blocked）

- **Agent**: `@writer`（仍為研究筆記）
- **狀態**: `clarification_needed`，已於 issue#61 留 comment。候選專案包含 `linshenkx/prompt-optimizer`、`microsoft/PromptWizard`、`stanfordnlp/dspy`、`vaibkumr/prompt-optimizer`、`zou-group/textgrad`，但缺少原貼文來源，直接研究會有捏造風險。
- **解除條件**: issue 作者補上 repo 連結 / 貼文截圖 / 影片逐字稿任一即可回到 queue。

## Dispatch rule（對齊 `cron/git-auto.md`）

1. Preflight：`git fetch origin && git status --porcelain` 清乾淨。
2. 跳過 `in_progress`、已有 open PR 的 issue。
3. 本輪 queue 中 lowest 可執行 issue = **#77**。
4. 從 `origin/main` branch 出 `auto/issue-77`，執行 `@writer` agent（`claude/agents/writer.md` + `prompts/formatting.md` + `prompts/mermaid.md` + `prompts/quartz.md`）。
5. 一個 issue 一個 PR，明確列檔加入 stage，不動 `.automation/`。

## Agent 能力對照（`claude/config.yaml`）

| Agent | 適合處理 | 本次派工 |
|-------|----------|----------|
| `writer` | 把研究 / 實驗轉成精簡 Quartz 筆記 | #61、#63、#74、#75、#76、**#77** |
| `reviewer` | 稽核技術正確性 / 風格 / 完整度 | 各 PR merge 前 review pass |
| `diagram` | 產生 / 重構 Mermaid（LR） | 如 #77 需要 workflow 圖再呼叫 |
| `content-ops` | 檔案組織、frontmatter、批次維護 | #67（非本輪）、未來 bulk rename |
