---
title: Research & Writing Triage Queue
---

> Input for `./cron/git-auto.md`. Orders the open research/writing backlog so the automation picks one issue per run, lowest number first, and ignores non-content work.

## Filter criteria

Included: open issues whose deliverable is a **study / research note under `content/`** — i.e., labelled `documentation` and scoped to research synthesis, tool breakdown, or authored note.

Excluded:
- `#63` — Mintlify framework adoption (platform migration decision, not a note). Route to maintainer.
- `#67` — Duplicate title bug on rendered pages (frontend/layout fix, not content authoring). Route to bug triage.

## Queue (lowest number first)

| # | Issue | Deliverable | Operational requirements | Agent | Sub-agents |
|---|-------|-------------|--------------------------|-------|------------|
| 1 | [#61](https://github.com/wahengchang/ai-study-note/issues/61) | Research summary of 小紅書 open-source prompt-optimization project | Resolve xhslink redirect; identify the actual repo; extract core features; evaluate fit for `content/` | `@writer` | `@reviewer` |
| 2 | [#74](https://github.com/wahengchang/ai-study-note/issues/74) | Study note positioning Astron Agent, Serper.dev, Jina AI, Python node, LLM as workflow components | Capture role + pricing tier per tool; include official links; frame workflow-parts narrative for non-technical readers | `@writer` | `@reviewer` |
| 3 | [#75](https://github.com/wahengchang/ai-study-note/issues/75) | Learn note on LLM-based knowledge management with raw/wiki split | Summarize raw-vs-wiki separation; reference Karpathy + 林穎俊 prior art; note Obsidian + Git implementation path | `@writer` | `@reviewer` |
| 4 | [#76](https://github.com/wahengchang/ai-study-note/issues/76) | Research note on n8n-driven AI YouTube automation workflow | Decompose end-to-end pipeline; classify ~15 named tools by layer; flag cost/copyright/policy risk; propose PoC | `@writer` | `@diagram`, `@reviewer` |
| 5 | [#77](https://github.com/wahengchang/ai-study-note/issues/77) | Research note on terminal multiplexing workflow boosting Claude Code productivity (`cmux`) | Confirm the tool referenced in source post; compare vs `tmux` / `zellij` / WezTerm; produce minimum workflow recipe | `@writer` | `@diagram`, `@reviewer` |

## Agent rationale

- **`@writer`** owns every queued item — each deliverable is a Quartz-formatted note under `content/`, which matches the writer agent's role (`claude/agents/writer.md`).
- **`@reviewer`** performs mandatory style + accuracy QA before PR marks `pr_open` (`claude/agents/reviewer.md`).
- **`@diagram`** is engaged for `#76` (workflow pipeline) and `#77` (pane layout / tool comparison) where an LR Mermaid diagram adds clarity per project rules.
- **`@content-ops`** is **not** engaged on new-note creation; it is reserved for taxonomy audits and bulk moves.

## Execution contract (binds to `cron/git-auto.md`)

For each run, the automation MUST:

1. Preflight per `cron/git-auto.md` §On each run step 1.
2. Read this queue top-down; pick the first issue whose tracker status is not `in_progress`, `pr_open`, `done`, or `blocked`.
3. Branch fresh from `origin/main` as `auto/issue-<n>` (invariant).
4. Delegate authoring to the agent listed in the **Agent** column; engage sub-agents only when the row requires it.
5. Enforce the writer's quality checklist (`claude/agents/writer.md` §Quality Checklist) before commit.
6. One issue per branch, one branch per PR. No bundling.
7. Record outcome in `.automation/issues.json` — never stage or commit that file.

## Out-of-scope issues (for reference, not for this workflow)

| # | Reason | Suggested route |
|---|--------|-----------------|
| #63 | Framework migration decision, not content authoring | Maintainer review; spin out an ADR under `docs/` if approved |
| #67 | Rendering bug in layout/frontmatter handling | Frontend fix path; outside `@writer` scope |
