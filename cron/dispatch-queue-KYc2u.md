---
title: Research & Writing Dispatch Queue — KYc2u
---

Kickoff artefact for [`cron/git-auto.md`](./git-auto.md). Audits the open issue
queue, filters to **research / writing** scope, maps each item to the agent
defined in [`claude/config.yaml`](../claude/config.yaml), and records current
PR state so the git-auto worker picks up the lowest unblocked issue on the
next cycle.

## Operational snapshot

- Branch: `claude/gracious-hawking-KYc2u` — reset to `origin/main@155880d`, working tree clean
- Repo: `wahengchang/ai-study-note`
- Scope filter: open issues with research or writing deliverables under `content/`; exclude layout bugs, framework migrations, bulk ops

## Filter result（research / writing only）

| # | Scope | Agent | Existing PR | Next action |
|---|-------|-------|-------------|-------------|
| #61 | Research（小紅書 prompt optimization repo） | `@writer` | — | ⏸ `clarification_needed` — 原貼文登入牆，缺 repo 線索（issue 已留 comment） |
| #74 | Writing（Astron / Serper / Jina / Python node / LLM workflow 分工） | `@writer` | **#155**（closes #74） | skip — in flight |
| #75 | Research + Writing（raw/wiki 兩層 LLM 知識管理） | `@writer` | **#156**（closes #75） | skip — in flight |
| #76 | Research + Writing（n8n × AI YouTube 自動化） | `@writer` | **#154**（closes #76） | skip — in flight |
| #77 | Research + Writing（cmux × Claude Code 終端多工） | `@writer`（+ `@diagram` on demand） | — | ✅ **dispatch next** |

Out of scope（非研究 / 寫作）：
- **#63** — Mintlify 框架評估（已由 #124 承接，屬架構方向評估而非 content authoring）
- **#67** — duplicate title layout bug（routes to `@content-ops` / Quartz layout fix, 非 writer scope）

## Operational requirements per filtered issue

### #77 — cmux × Claude Code 終端多工（dispatch target）
- **Deliverable**: 一篇研究筆記 + 工具比較表 + 最小實作建議
- **Research load**: 追小紅書原貼文（http://xhslink.com/o/AAbGLpO7BY4）確認 `cmux` 實際身分；對比 tmux / zellij / screen / WezTerm / Warp mux
- **Writing load**: Principal-Engineer voice、bullet-first、copy-pasteable shell snippets、Mermaid `direction LR` 僅在多 pane workflow 需要視覺化時使用
- **Agent**: `@writer` 主導；`@diagram` on-demand 產出 pane layout diagram
- **DoD**: 確認原工具身分 / 至少 3 個可比較工具 / 至少 1 套可落地 Claude Code workflow / 明確說明適用情境與限制

### #75 — raw / wiki 雙層 LLM 知識管理（in flight on #156）
- **Deliverable**: learn note，區分 raw（素材層）與 wiki（知識層）、AI 整理流程、查詢回寫 loop
- **Agent**: `@writer`（+ `@diagram` 視覺化 raw→wiki 資料流）
- **Status**: PR #156 覆蓋，跳過

### #76 — n8n × AI YouTube 自動化（in flight on #154）
- **Deliverable**: workflow 拆解、工具分類（orchestration / LLM / visual / audio / render / publish / storage）、最小 PoC 架構
- **Agent**: `@writer`
- **Status**: PR #154 覆蓋，跳過

### #74 — Astron / Serper / Jina / Python node / LLM workflow 分工（in flight on #155）
- **Deliverable**: 非技術讀者可讀的 study note，釐清各零件定位與收費
- **Agent**: `@writer`
- **Status**: PR #155 覆蓋，跳過

### #61 — 小紅書 prompt optimization repo（blocked）
- **Deliverable**: 研究摘要 + 3 個可複用重點 + 是否收錄結論
- **Blocker**: 原貼文登入牆，需使用者補 repo 線索
- **Status**: `clarification_needed`，保持 open，不 dispatch

## Delegation rationale

- 所有可派送 issue 的 deliverable 都是 `content/` 下的 Quartz note，核心 agent 為
  [`claude/agents/writer.md`](../claude/agents/writer.md) — Principal-Engineer
  voice、frontmatter `title` 必填、kebab-case 檔名、Mermaid LR only
- [`@diagram`](../claude/agents/diagram.md) 僅在 #77（多 pane workflow）、#75（raw/wiki
  資料流）需要視覺化時 on-demand 呼叫；不加無附加價值的圖
- [`@reviewer`](../claude/agents/reviewer.md) 於 content PR merge 前做 style /
  accuracy pass，不在 kickoff 階段動作
- [`@content-ops`](../claude/agents/content-ops.md) 保留給 #67 與未來 bulk
  frontmatter / rename / 目錄重組，與本 queue 無關

## Agent ↔ prompt fragment 對照（sanity check vs `claude/config.yaml`）

| Agent | Prompts composed |
|-------|------------------|
| `writer` | `formatting.md` + `mermaid.md` + `quartz.md` |
| `reviewer` | `formatting.md` + `quartz.md` |
| `diagram` | `mermaid.md` |
| `content-ops` | `formatting.md` + `quartz.md` |

與 `claude/config.yaml` 完全一致，無漂移。

## Next git-auto cycle（per [`cron/git-auto.md`](./git-auto.md)）

1. **Preflight**: `git fetch origin && git status --porcelain` 必須乾淨，否則 abort
2. **Skip** 有 open PR 或標記 `in_progress` 的 issue（見上表 — #74/#75/#76 已在 #155/#156/#154 處理中）
3. **Lowest actionable** issue = **#77**（#61 仍 `clarification_needed`）
4. 動作序列：
   - `git fetch origin && git checkout -B auto/issue-77 origin/main`（絕不從 stale branch 派生）
   - 由 `@writer` 產出 `content/claude-code/...` 下的研究筆記（最終檔路徑由 writer 決定，保留 kebab-case）
   - 必要時呼叫 `@diagram` 畫出多 pane workflow（`direction LR`）
   - Stage by explicit path；`.automation/` 絕不入 stage
   - `git diff --cached --stat` 驗證 → commit → `git push -u origin auto/issue-77`
   - 開單一 PR，body 含 #77 驗收條件 checklist

## Test plan

- [x] 檔名 `cron/dispatch-queue-KYc2u.md` 為 kebab-case；frontmatter `title` 齊備
- [x] Agent 對照表與 `claude/config.yaml` 一致
- [x] 交叉比對 open PR 清單（#154 → #76, #155 → #74, #156 → #75, #124 → #63）
- [x] #77 作為下一輪 dispatch 目標，無既有 content PR 衝突
- [ ] `cron/git-auto.md` 下一 run 從 #77 開始執行（留待下一 cycle 驗證）
