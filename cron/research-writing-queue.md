# Research & Writing Queue — Delegation Manifest

> Companion to `cron/git-auto.md`. Audits the open issue queue, filters for
> research and writing work, and pre-assigns each issue to an agent so the
> automated per-run executor has an unambiguous target.

## Source of truth

- Queue scan date: 2026-04-14
- Repo: `wahengchang/ai-study-note`
- Filter: issues whose deliverable is a Quartz note under `content/` (research
  summary, study note, workflow write-up). Excludes pure bug fixes, layout
  refactors, and infra migrations unless the primary artifact is a note.

## Execution contract

- Follow `cron/git-auto.md` invariants for every pick. One issue per branch,
  one branch per PR, branch fresh from `origin/main` as `auto/issue-<n>`.
- Lowest open issue number wins on each run. Skip anything already tracked as
  `in_progress`, `pr_open`, or blocked.
- Each run consumes the top row of the queue below and produces exactly one PR
  closing that issue.
- Primary agent handles drafting. Reviewer agent is a mandatory second pass
  before the commit. Diagram agent is engaged only if the primary agent flags
  a diagram need in its plan.

## Agent assignments

| Issue | Title (abbrev.) | Type | Primary | Support | Deliverable |
|-------|-----------------|------|---------|---------|-------------|
| #61 | 小紅書 prompt optimizer research | Research → note | `@writer` | `@reviewer` | `content/research-notes/xhs-prompt-optimizer.md` |
| #63 | Mintlify framework adoption | Research → planning doc | `@writer` | `@reviewer`, `@content-ops` | `content/research-notes/mintlify-adoption.md` |
| #74 | Astron Agent / Serper / Jina / Python node / LLM | Writing (study note) | `@writer` | `@reviewer` | `content/study-notes/ai-workflow-building-blocks.md` |
| #75 | LLM knowledge management — raw/wiki workflow | Research → learn note | `@writer` | `@reviewer`, `@diagram` | `content/learn-notes/llm-raw-wiki-km.md` |
| #76 | n8n AI YouTube automation workflow | Research → note + workflow table | `@writer` | `@reviewer`, `@diagram` | `content/research-notes/n8n-ai-youtube-workflow.md` |
| #77 | cmux / terminal multiplexing for Claude Code | Research → note + tool comparison | `@writer` | `@reviewer` | `content/research-notes/terminal-multiplexing-claude-code.md` |

Issues not on this manifest:

- #67 — duplicate article titles: layout/content-ops bug fix, not research or
  writing. Route through a separate queue owned by `@content-ops`.

## Operational requirements per issue

### #61 — 小紅書 prompt optimizer research

- **Primary**: `@writer`
- **Scope**: Identify the referenced open-source prompt-optimizer project,
  summarize it, evaluate fit for ai-study-note.
- **Inputs**: XHS link `http://xhslink.com/o/7iAalKtM6SX`, existing comment
  trail on the issue.
- **External work**: Web lookup to resolve the actual repo; verify README and
  license before citing.
- **Risk**: XHS link may be unresolvable. If so, mark `clarification_needed`
  and stop per `git-auto.md` §4.
- **DoD mirrors the issue**: repo identified, TL;DR, 3+ reusable insights,
  explicit inclusion verdict.

### #63 — Mintlify adoption analysis

- **Primary**: `@writer` with `@content-ops` review for migration implications.
- **Scope**: Write a planning note that locks the Mintlify direction. Do NOT
  start the migration in this issue.
- **Inputs**: Reference `agentskills.io/home`, current Quartz config
  (`quartz.config.ts`, `quartz.layout.ts`).
- **Output shape**: Architect-type note per `claude/agents/writer.md` with
  Context → Key Findings → Implementation trade-offs → Next steps.
- **Risk**: Scope creep into actual migration. Enforce "planning only".

### #74 — AI workflow building blocks study note

- **Primary**: `@writer`
- **Scope**: Explain Astron Agent, Serper.dev, Jina AI, Python node, and LLM
  as workflow components, with role + pricing + official link table.
- **Inputs**: User-provided Telegram summary referenced in the issue.
- **Audience note**: issue asks for a non-technical-friendly pass; keep the
  writer agent's "no fluff" rule but retain a plain-language section.
- **Risk**: Mixing tool categories. Use a comparison table to keep roles
  distinct.

### #75 — Raw/wiki LLM knowledge management

- **Primary**: `@writer`
- **Support**: `@diagram` for the raw → wiki → query feedback loop (Mermaid
  `direction LR`).
- **Scope**: Learn note on the two-tier raw/wiki design, referencing
  Karpathy and 林穎俊 prior art.
- **Inputs**: User-supplied zh-TW transcript, facebook share link.
- **Overlap check**: commit `bc7dd17` already landed a Karpathy wiki note
  (closes #65). Writer must diff against that note and focus on the raw/wiki
  separation angle to avoid duplicate content.

### #76 — n8n AI YouTube automation workflow

- **Primary**: `@writer`
- **Support**: `@diagram` for the end-to-end pipeline diagram.
- **Scope**: Workflow breakdown + categorized tool table (orchestration, LLM,
  visual, audio, rendering, publishing, storage) + PoC sketch + risk section.
- **Inputs**: YouTube source `https://www.youtube.com/watch?v=5Htbfh_LYSE`.
- **Risk**: Long tool list encourages shallow coverage. Writer must enforce
  one-sentence role + one-sentence limit per tool, not paragraph-length
  descriptions.

### #77 — Terminal multiplexing for Claude Code

- **Primary**: `@writer`
- **Scope**: Resolve whether "cmux" refers to the common package or a newer
  project; compare against tmux/zellij/WezTerm; produce a minimum viable
  Claude Code workflow recommendation.
- **Inputs**: XHS link `http://xhslink.com/o/AAbGLpO7BY4`.
- **Risk**: Same XHS resolvability risk as #61.
- **Deliverable extras**: tool comparison table, one concrete pane layout.

## Run order

Per `cron/git-auto.md` §4 (lowest number first):

1. #61
2. #63
3. #74
4. #75
5. #76
6. #77

Each subsequent automated run picks the next unprocessed row, creates
`auto/issue-<n>` from fresh `origin/main`, invokes the assigned primary
agent, runs `@reviewer` before commit, and opens a single PR closing that
issue.

## Pre-commit gate (applies to every downstream PR)

- `npm run check` exits 0.
- `npm run quartz -- build` exits 0.
- New note has required `title` frontmatter, kebab-case filename, correct
  `content/<topic>/` location.
- No `.automation/` paths staged (verify with `git diff --cached --stat`).
- PR body cites the source issue with `Closes #<n>`.
