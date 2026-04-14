---
title: Research & Writing Queue Dispatch
---

## Purpose

Triage the open issue queue for research/writing tasks, map each to the correct
agent in `claude/agents/`, and hand the queue off to `cron/git-auto.md` for
serial execution (lowest issue number first, one issue per run, one PR per
issue).

- Queue source: `wahengchang/ai-study-note` open issues
- Execution workflow: `cron/git-auto.md`
- Agent registry: `claude/config.yaml`
- Audit date: 2026-04-14

## Filter Criteria

Included: issues whose primary deliverable is a Quartz Markdown note under
`content/` (research write-up, study note, learn note, workflow breakdown).

Excluded: framework migrations, layout/template bug fixes, and other
engineering work that does not produce a content note.

## Filtered Queue (execution order)

| Order | Issue | Title (short) | Type | Agent | Size |
|------:|:-----:|:--------------|:-----|:------|:-----|
| 1 | #61 | 寶藏開源項目 — auto-optimize prompts | Research | `@writer` | S |
| 2 | #74 | Astron Agent / Serper / Jina / Python node / LLM | Writing | `@writer` | S–M |
| 3 | #75 | LLM-based knowledge mgmt (raw / wiki) | Research + Writing | `@writer` | M |
| 4 | #76 | n8n AI YouTube automation workflow | Research | `@writer` + `@diagram` | L |
| 5 | #77 | cmux / terminal multiplexing × Claude Code | Research | `@writer` | M |

## Out of Scope (not dispatched here)

| Issue | Reason |
|:-----:|:-------|
| #63 | Mintlify framework adoption — engineering / migration, not a content note. |
| #67 | Duplicate H1 / title rendering bug — theme-layout or content convention fix; route to `@content-ops`, not this queue. |

## Per-issue Operational Requirements

### #61 — 寶藏開源項目：自動優化專業級提示詞

- **Source**: XHS link `http://xhslink.com/o/7iAalKtM6SX`
- **Required actions**:
  1. Identify the exact OSS project referenced in the post.
  2. Capture repo / site URL, license, maintenance state.
  3. 3–5 line TL;DR; core features; concrete usage flow.
  4. 3+ reusable takeaways; fit assessment for `ai-study-note`.
- **Agent**: `@writer`
- **Prompt fragments**: `formatting.md`, `quartz.md`
- **Output path**: `content/research-notes/<kebab-case>.md`
- **Acceptance**: matches Definition of Done in issue body.

### #74 — Astron Agent / Serper / Jina / Python node / LLM

- **Source**: user-supplied Telegram summary (already in issue body).
- **Required actions**:
  1. One-line positioning for each of the 5 components.
  2. Pricing model (free tier vs. paid) with official links.
  3. Clarify these are workflow parts, not competing AI tools.
  4. Beginner-accessible prose; keep one non-technical pass.
- **Agent**: `@writer`
- **Prompt fragments**: `formatting.md`, `quartz.md`
- **Output path**: `content/ai-workflow/<kebab-case>.md`
- **Acceptance**: clear title, publishable draft, no tool-category confusion.

### #75 — LLM-based knowledge management (raw / wiki)

- **Source**: user script + Karpathy / 林穎俊 references.
- **Required actions**:
  1. Articulate raw (immutable source) vs. wiki (curated knowledge) split.
  2. Describe AI-assisted curation loop (summarize, classify, link).
  3. Explain query → cross-reference → write-back feedback loop.
  4. Low-friction stack: IDE + Obsidian + Markdown + Git.
- **Agent**: `@writer`
- **Prompt fragments**: `formatting.md`, `mermaid.md`, `quartz.md`
- **Output path**: `content/knowledge-management/<kebab-case>.md`
- **Notes**: Mermaid LR diagram for raw → wiki → query loop if it adds clarity.

### #76 — n8n AI YouTube automation workflow

- **Source**: YouTube video `5Htbfh_LYSE`.
- **Required actions**:
  1. Break down the end-to-end pipeline (ideation → publish → monitor).
  2. Tool inventory grouped by stage (orchestration, LLM, visual, audio,
     rendering, publishing, storage/logging).
  3. Identify true no-code portions vs. required engineering glue.
  4. Cost, copyright, and YouTube-policy risk call-outs.
  5. One minimal viable PoC architecture.
- **Agent**: `@writer` (primary), `@diagram` (workflow architecture)
- **Prompt fragments**: `formatting.md`, `mermaid.md`, `quartz.md`
- **Output path**: `content/research-notes/<kebab-case>.md`
- **Notes**: Largest item in the queue — expect a longer note with a tool
  matrix and at least one Mermaid LR diagram.

### #77 — cmux / terminal multiplexing × Claude Code

- **Source**: XHS link `http://xhslink.com/o/AAbGLpO7BY4`.
- **Required actions**:
  1. Verify which project the post means by `cmux`.
  2. Compare against `tmux`, `zellij`, `screen`, WezTerm mux, Warp.
  3. Document Claude Code multi-pane patterns (agent / logs / edit /
     long-running monitor).
  4. Produce a minimal, adoptable workflow with caveats.
- **Agent**: `@writer`
- **Prompt fragments**: `formatting.md`, `quartz.md`
- **Output path**: `content/claude-code/<kebab-case>.md`
- **Acceptance**: tool comparison table + 1 concrete workflow + scope limits.

## Execution Handoff

Run `cron/git-auto.md` on each pass:

1. Preflight (clean tree, `git fetch origin`, branch off `origin/main`).
2. Pick the lowest-numbered open issue in this queue whose status is not
   `in_progress` and that does not already have an open PR.
3. Branch `auto/issue-<n>` from fresh `origin/main`.
4. Execute using the designated agent and prompt fragments above.
5. Stage by explicit path only; never commit `.automation/`.
6. `npm run check` and `npm run quartz -- build` before commit.
7. Open exactly one PR; record status in the local tracker.

> [!note]
> This manifest is the initiation artifact — it does not itself modify any
> notes under `content/`. Each issue is implemented in its own follow-up PR
> per the `cron/git-auto.md` invariants.
