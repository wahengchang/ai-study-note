---
title: Issue Queue Dispatch — Research & Writing
---

Audit of the open issue queue filtered for research and writing tasks, with
operational requirements analyzed and each issue delegated to the appropriate
agent in `claude/config.yaml`. Execution is handled by the workflow defined in
[`./git-auto.md`](./git-auto.md): **one issue per branch, lowest number first,
branched fresh from `origin/main`**.

## Filter Result

| # | Kind | Labels | Skill fit | Assigned agent |
|---|------|--------|-----------|----------------|
| 61 | Research | — | note authoring + source confirmation | `@writer` |
| 74 | Writing | documentation, enhancement | note authoring from provided draft | `@writer` |
| 75 | Research | documentation, enhancement | note authoring + concept synthesis | `@writer` |
| 76 | Research | documentation, enhancement | workflow breakdown + tool taxonomy | `@writer` (+ `@diagram` for workflow graph) |
| 77 | Research | documentation, enhancement | source confirmation + tool comparison | `@writer` (+ `@diagram` for comparison) |

Excluded from the queue:

- **#67** — site bug fix (duplicate H1 render). Not a research/writing task.
- **#63** — framework migration evaluation (Mintlify). Produces a planning
  task, not a content note.

## Per-Issue Operational Requirements

### #61 — 研究：小紅書寶藏開源項目，自動優化專業級提示詞
- **Primary agent**: `@writer`
- **Inputs**: xhslink URL in the issue body; existing comment thread.
- **Steps**:
  1. Resolve the short link and identify the actual open-source project
     referenced in the Xiaohongshu post.
  2. Produce a research note under `content/` (kebab-case filename,
     `title` frontmatter) covering: TL;DR, core features, usage, fit for
     `ai-study-note`.
  3. Include at least three reusable takeaways and a collection verdict.
- **Delegation rationale**: Authoring a study note from an external source
  maps to `@writer`'s "Convert … workflows into lean Quartz Markdown notes"
  scope.
- **Risks**: Short-link may resolve to a non-canonical mirror; log the
  resolved project URL in the note.

### #74 — Study note: Astron Agent, Serper.dev, Jina AI, Python node, LLM
- **Primary agent**: `@writer`
- **Inputs**: user's Telegram draft (已提供) — positioning, pricing, links
  for each component.
- **Steps**:
  1. Normalize the draft into a Quartz note under `content/` (plain-language
     layer + component reference table).
  2. Clarify that each item is a distinct workflow part, not a single tool.
  3. Surface the "usually-free-to-start vs. paid-at-scale" breakdown.
- **Delegation rationale**: Pure authoring from a provided draft; no new
  research required.
- **Risks**: Pricing accuracy — the note must cite the source draft, not
  speculate on current tier limits.

### #75 — Learn note: LLM-based knowledge management (raw / wiki workflow)
- **Primary agent**: `@writer`
- **Inputs**: user-provided Chinese description; references to Andrej
  Karpathy and 林穎俊老師 prior art; Facebook share link.
- **Steps**:
  1. Draft the raw/wiki two-layer model with clear role separation
     (raw = immutable source, wiki = evolving synthesis).
  2. Explain the feedback loop: queries mutate the wiki.
  3. Position the IDE + Obsidian + Markdown + Git stack as the low-floor
     implementation path.
- **Delegation rationale**: Conceptual synthesis with an outline-first
  deliverable — `@writer`'s core scope.
- **Risks**: Attribution — must credit the two referenced authors without
  overclaiming their endorsement of the simplified version.

### #76 — Research: n8n YouTube automation workflow
- **Primary agent**: `@writer`
- **Supporting agent**: `@diagram` for the workflow visualization.
- **Inputs**: YouTube video URL; explicit tool list in the issue body.
- **Steps**:
  1. Decompose the end-to-end pipeline (ideation → script → visuals →
     audio → assembly → publishing → ops).
  2. Tabulate each stage against its tool options and alternatives.
  3. Call out which stages are genuinely no-code and which require
     engineering glue.
  4. Produce a PoC architecture for a minimum viable workflow.
  5. Document risks: content quality, copyright, YouTube policy.
- **Delegation rationale**: Research + structured note output; `@diagram`
  contributes the LR workflow graph per project mermaid rules.
- **Risks**: Tool pricing and API availability shift fast — note must be
  dated and link to primary sources.

### #77 — Research: terminal multiplexing workflow for Claude Code (cmux)
- **Primary agent**: `@writer`
- **Supporting agent**: `@diagram` for the tool comparison table / pane
  layout sketch.
- **Inputs**: xhslink URL; claim that `cmux` triples Claude Code
  productivity.
- **Steps**:
  1. Resolve the short link and identify the actual `cmux` project cited.
  2. Compare against `tmux`, `zellij`, `screen`, WezTerm mux, etc.
  3. Document at least one concrete multi-pane workflow for Claude Code
     (agent pane, log pane, edit/git/test pane, long-running monitor).
  4. Note scope and limits of each option.
- **Delegation rationale**: Source-confirmation + comparative note output
  fits `@writer`; `@diagram` can render the pane layout in LR mermaid.
- **Risks**: Name collision — "cmux" may refer to multiple projects;
  the note must pin the exact repo.

## Execution Contract (per `git-auto.md`)

Downstream execution must follow the invariants in `cron/git-auto.md`:

1. **Preflight**: verify `gh` / `git`, `git fetch origin`, working tree clean
   (ignoring `.automation/`).
2. **One issue per run, lowest number first**. On this queue that means
   **#61** runs first, then #74, #75, #76, #77.
3. **Branch fresh**: `git fetch origin && git checkout -B auto/issue-<n> origin/main`.
4. **Stage by explicit path only** — never `git add .` / `git add -A`, never
   stage `.automation/`.
5. **Validate**: `npm run quartz -- build` must exit 0 before commit.
6. **One PR per issue**. Mark the tracker `pr_open` on success, `failed` on
   validation failure, `blocked` if unsafe.

## Agent Invocation Summary

| Issue | Primary | Supporting | Deliverable |
|-------|---------|------------|-------------|
| #61 | `@writer` | — | `content/**/*.md` research note |
| #74 | `@writer` | — | `content/**/*.md` study note |
| #75 | `@writer` | — | `content/**/*.md` learn note |
| #76 | `@writer` | `@diagram` | Research note + LR workflow diagram |
| #77 | `@writer` | `@diagram` | Research note + comparison layout |

All notes must pass `@reviewer` style/accuracy check and
`npm run quartz -- build` before the PR is opened.
