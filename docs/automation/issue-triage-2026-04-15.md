---
title: Issue Triage — 2026-04-15 (Research & Writing)
---

## Context
Audit of the open issue queue, filtered to research and writing tasks, with operational requirements and agent delegation. This triage initiates the execution workflow defined in [`cron/git-auto.md`](../../cron/git-auto.md) (one issue per run, lowest number first).

## Filtered Queue

Open issues in `wahengchang/ai-study-note` scoped to research / writing. Issue #67 (UI bug — duplicate titles) is excluded from this triage.

| # | Type | Title (short) | Labels |
|---|------|---------------|--------|
| 61 | Research | 寶藏開源項目：自動優化提示詞 — 確認專案來源與收錄價值 | — |
| 74 | Writing | Astron Agent / Serper / Jina AI / Python node / LLM — workflow roles & pricing | documentation, enhancement |
| 75 | Research + Write | LLM 知識管理（raw / wiki 兩層分離） | documentation, enhancement |
| 76 | Research | n8n AI YouTube automation workflow | documentation, enhancement |
| 77 | Research | 終端多工（cmux / tmux / zellij）× Claude Code 工作流 | documentation, enhancement |

## Operational Requirements per Issue

### #61 — Prompt-optimization open-source project (Xiaohongshu)
- **Operational steps**: resolve source link → identify repo → write TL;DR, features, use cases → decide inclusion.
- **Deliverable**: one research note under `content/` with project name, repo, 3–5-line TL;DR, ≥3 reusable takeaways, inclusion verdict.
- **Risk**: source link may be unreachable; flag with `> [!warning]` if unverifiable.

### #74 — Astron Agent / Serper / Jina AI / Python node / LLM study note
- **Operational steps**: organize user-supplied draft → disambiguate AI-model vs tool vs platform vs logic-node → add pricing notes → link official sources.
- **Deliverable**: publish-ready note with tool-role table and pricing column; plain-language audience.
- **Risk**: blurring "AI tool" vs "workflow component" — reviewer must enforce.

### #75 — raw/wiki knowledge-management study note
- **Operational steps**: restate the two-layer design (raw immutable, wiki evolving) → summarize Karpathy / 林穎俊 references → outline IDE + Obsidian + Markdown + Git low-friction stack.
- **Deliverable**: outline or first draft explaining why raw/wiki separation compounds value; one LR Mermaid diagram for the feedback loop.
- **Risk**: drifting into product design — keep scope to personal KM.

### #76 — n8n AI YouTube automation workflow
- **Operational steps**: decompose end-to-end pipeline (ideation → script → visuals → audio → assembly → publish → telemetry) → classify each tool → note code-free vs integration-required → PoC minimum.
- **Deliverable**: research note, tool taxonomy table, one LR flowchart, PoC architecture sketch, risk callouts (copyright, YouTube policy, duplicate content).
- **Risk**: tool list is broad — cap to one row per tool to preserve density.

### #77 — Terminal multiplexing × Claude Code
- **Operational steps**: confirm `cmux` identity from source post → compare with tmux / zellij / WezTerm mux → codify a minimum Claude Code multi-pane workflow.
- **Deliverable**: research note, ≥3-tool comparison table, one practical workflow, explicit applicability/limits.
- **Risk**: `cmux` may refer to multiple projects — require source verification before publishing.

## Agent Delegation Matrix

Agents defined in [`claude/config.yaml`](../../claude/config.yaml):

| # | Primary | Supporting | Rationale |
|---|---------|------------|-----------|
| 61 | `@writer` | `@reviewer` | Research synthesis → lean study note; reviewer audits evidence chain. |
| 74 | `@writer` | `@reviewer` | User draft → publish-ready note; role/pricing accuracy is reviewer-critical. |
| 75 | `@writer` | `@diagram`, `@reviewer` | Raw/wiki loop benefits from an LR feedback diagram. |
| 76 | `@writer` | `@diagram`, `@reviewer` | Pipeline decomposition requires LR flowchart + taxonomy table. |
| 77 | `@writer` | `@diagram`, `@reviewer` | Tool comparison + workflow diagram; `@diagram` handles the pane layout schematic. |

`@content-ops` is not invoked here — no cross-file reorganization is required; each issue yields a single note. It will be engaged post-merge to place notes in the correct taxonomy folder if the writer leaves placement ambiguous.

## Execution Order

Per `cron/git-auto.md` §4, exactly one issue is processed per run, lowest number first.

1. **Next run**: issue **#61** — `@writer` produces the research note on branch `auto/issue-61` off fresh `origin/main`.
2. Subsequent runs: **#74 → #75 → #76 → #77**.
3. Each issue gets its own branch and PR; never bundle.

## Invariants (from `cron/git-auto.md`)
- Branch fresh from `origin/main` each run.
- One issue per branch, one branch per PR.
- Stage files by explicit path; never `git add .` or `.automation/`.
- Abort if working tree is dirty.
