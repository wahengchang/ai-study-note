---
title: Research & Writing Dispatch Queue — iae7g
---

Kickoff artefact for [`cron/git-auto.md`](./git-auto.md). Audits the open issue
queue, filters to **research / writing** scope, maps each item to the agent
defined in [`claude/config.yaml`](../claude/config.yaml), and records current
PR state so the git-auto worker picks up the lowest unblocked issue on the
next cycle.

## Operational snapshot

- Branch: `claude/gracious-hawking-iae7g`（與 `origin/main` 同 commit，工作樹乾淨）
- Repo: `wahengchang/ai-study-note`
- Scope filter: labels `documentation` / `enhancement` with research 或 writing deliverables；排除 layout / bug / framework migration。

## Filter result（research / writing only）

| # | 類型 | Agent | 既有 PR | 下一步 |
|---|------|-------|---------|--------|
| #61 | Research | `@writer` | — | ⏸ `clarification_needed` — 原小紅書貼文登入牆，缺 repo 線索（issue 已留 comment） |
| #63 | Research（Mintlify 框架評估） | `@writer` | #124 | skip — in flight |
| #74 | Writing（Astron / Serper / Jina / LLM workflow 分工） | `@writer` | #155, #121 | skip — in flight |
| #75 | Research + Writing（raw/wiki 知識管理） | `@writer` | #156, #120 | skip — in flight |
| #76 | Research + Writing（n8n × AI YouTube 自動化） | `@writer` | #154 | skip — in flight |
| #77 | Research + Writing（cmux × Claude Code 終端多工） | `@writer`（+ `@diagram` on demand） | — | ✅ **dispatch next** |

Excluded（非研究 / 寫作）：**#67**（重複標題 layout bug → `@content-ops`）。

## Delegation rationale

- 所有可派送 issue 的 deliverable 都是 `content/` 下的 Quartz note，核心 agent 為
  [`claude/agents/writer.md`](../claude/agents/writer.md) — Principal-Engineer
  voice、frontmatter `title` 必填、kebab-case 檔名、Mermaid LR only。
- [`@diagram`](../claude/agents/diagram.md) 僅在 #77（多 pane workflow）、#75（raw/wiki 資料流）
  需要視覺化時 on-demand 呼叫；不加無附加價值的圖。
- [`@reviewer`](../claude/agents/reviewer.md) 於 content PR merge 前做 style /
  accuracy pass，而非 kickoff 階段。
- [`@content-ops`](../claude/agents/content-ops.md) 保留給 #67 與未來 bulk frontmatter /
  rename / 目錄重組作業，與本 queue 無關。

## Next git-auto cycle（per [`cron/git-auto.md`](./git-auto.md)）

1. **Preflight**: `git fetch origin && git status --porcelain` 必須乾淨，否則 abort。
2. **Skip** 有 open PR 或標記 `in_progress` 的 issue（見上表）。
3. **Lowest actionable** issue = **#77** — `cmux` / 終端多工與 Claude Code 工作流。
4. 動作序列：
   - `git checkout -B auto/issue-77 origin/main`
   - 由 `@writer` 產出 `content/claude-code/tools-and-skills/terminal-multiplexing-workflow.md`
     （檔路徑留彈性，以 writer agent 最終決定為準）
   - 必要時呼叫 `@diagram` 畫出多 pane workflow（LR 方向）
   - Stage by explicit path，`.automation/` 絕不入 stage
   - `git diff --cached --stat` 驗證 → commit → `git push -u origin auto/issue-77`
   - 開單一 PR，body 含 Definition of Done checklist

## Agent ↔ prompt fragment 對照（sanity check）

| Agent | Prompts composed |
|-------|------------------|
| `writer` | `formatting.md` + `mermaid.md` + `quartz.md` |
| `reviewer` | `formatting.md` + `quartz.md` |
| `diagram` | `mermaid.md` |
| `content-ops` | `formatting.md` + `quartz.md` |

與 `claude/config.yaml` 一致，無漂移。

## Test plan

- [x] 檔名 `cron/dispatch-queue-iae7g.md` 採 kebab-case；frontmatter `title` 齊備
- [x] Agent 對照表與 `claude/config.yaml` 一致
- [x] 交叉比對 open PR 清單（#154/#155/#156 等 content PR；#124 Mintlify；#120/#121 前批 writer PR）
- [x] #77 作為下一輪 dispatch 目標，無既有 PR 衝突
- [ ] `cron/git-auto.md` 下一 run 從 #77 開始執行（留待下一 cycle 驗證）
