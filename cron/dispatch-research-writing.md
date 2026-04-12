# Research & Writing Dispatch — Issue Queue Audit

> Machine-readable input for `cron/git-auto.md`. Maps each open research/writing
> issue to the agent best suited to execute it, with operational requirements
> spelled out so the execution workflow can pick up each issue with zero
> ambiguity.
>
> **Scope**: issues filtered by intent = *research* or *writing*. Bug fixes,
> framework/infra tickets, and operational cleanup are out of scope for this
> dispatch cycle.

## Audit Summary

| # | Title | Intent | Primary Agent | Support | Status |
|---|---|---|---|---|---|
| 61 | 小紅書: open-source prompt optimizer research | Research | `@writer` | `@reviewer` | queued |
| 63 | Adopt Mintlify as docs site framework | Research (eval) | `@writer` | `@content-ops`, `@reviewer` | queued |
| 74 | Astron Agent / Serper / Jina / Python node / LLM study note | Writing | `@writer` | `@diagram`, `@reviewer` | queued |
| 75 | LLM knowledge management raw/wiki workflow | Research + Writing | `@writer` | `@diagram`, `@reviewer` | queued |
| 76 | n8n AI YouTube automation workflow research | Research + Writing | `@writer` | `@diagram`, `@reviewer` | queued |
| 77 | cmux / terminal multiplexing + Claude Code workflow | Research + Writing | `@writer` | `@diagram`, `@reviewer` | queued |

**Excluded from this cycle**
- `#67` duplicate article titles — layout/content bug, not research/writing. Route via `@content-ops` in a separate cycle.

## Agent Skill Matrix

| Agent | Scope | Why chosen |
|---|---|---|
| `@writer` | Evidence-based Quartz notes under `content/` with `title` frontmatter, key findings, steps | Every filtered issue terminates in a publishable note |
| `@reviewer` | Post-draft QA for structure, accuracy, style, completeness | All notes must clear reviewer gate before PR merge |
| `@diagram` | Mermaid `LR` diagrams for workflow/comparison artifacts | Required where the issue's deliverable is workflow-heavy |
| `@content-ops` | Taxonomy placement, frontmatter, folder routing | Needed only when the note touches structural decisions |

## Operational Requirements (per issue)

### Issue #61 — Prompt optimizer research (小紅書)

- **Primary agent**: `@writer`
- **Deliverable**: `content/prompt-notes/<kebab-case>.md` research summary
- **Operational steps**
  1. Identify the actual repo/project referenced in the 小紅書 post (follow linked URL, cross-check GitHub).
  2. Produce TL;DR (3–5 lines), core features, at least 3 reusable takeaways.
  3. Conclude with a keep/drop recommendation for `ai-study-note` inclusion.
- **Acceptance gates** (from issue DoD):
  - Source repo confirmed
  - ≥3 reusable points extracted
  - Inclusion verdict stated
- **Support**: `@reviewer` final pass.
- **Skip diagram**: research note, not workflow.

### Issue #63 — Mintlify framework evaluation

- **Primary agent**: `@writer` (research output, not implementation)
- **Deliverable**: `content/setup-env/mintlify-framework-evaluation.md`
- **Operational steps**
  1. Summarize Mintlify's tech stack (Next.js, MDX, Tailwind) and docs platform fit.
  2. Compare against current Quartz stack on: authoring model, search, theming, deploy surface.
  3. State a go / no-go recommendation with migration risk bullets. Do **not** execute any migration.
- **Acceptance gates**
  - Technical summary preserved for future migration work
  - Explicit framework-direction statement
- **Support**: `@content-ops` to confirm the note lands in the right folder; `@reviewer` for QA.

### Issue #74 — Astron Agent / Serper / Jina / Python / LLM study note

- **Primary agent**: `@writer`
- **Deliverable**: `content/claude-code/ai-workflow-components-astron-serper-jina.md` (or similar under the appropriate existing folder)
- **Operational steps**
  1. Use the user's supplied Telegram dump as the primary source — do not re-research.
  2. For each component (Astron Agent, Serper.dev, Jina AI, Python node, LLM) capture: role, pricing stance, official link.
  3. Close with a "workflow parts, not one AI tool" synthesis paragraph.
- **Acceptance gates**
  - Title + publishable draft
  - Pricing narratives distinct (free-start vs paid-at-scale)
  - Each component's role unambiguous
- **Support**: `@diagram` for a single `flowchart LR` wiring the five components together; `@reviewer` pass.

### Issue #75 — LLM knowledge management raw/wiki workflow

- **Primary agent**: `@writer`
- **Deliverable**: `content/claude-code/llm-raw-wiki-knowledge-workflow.md`
- **Operational steps**
  1. Translate user's Chinese narrative into a structured note (bilingual friendly).
  2. Separate `raw` vs `wiki` layer responsibilities explicitly.
  3. Describe the query → wiki enrichment loop.
  4. Frame as "low-friction personal KM with IDE + Obsidian + Markdown + Git".
- **Acceptance gates**
  - Clear title and outline
  - raw/wiki separation value explained
  - Extension hooks (query, synthesis, ideation) present
- **Support**: `@diagram` for the raw → wiki → query feedback loop (`flowchart LR`); `@reviewer` pass.

### Issue #76 — n8n YouTube automation research

- **Primary agent**: `@writer`
- **Deliverable**: `content/claude-code/n8n-ai-youtube-automation-workflow.md`
- **Operational steps**
  1. Decompose the video's end-to-end workflow into the seven stages listed in the issue.
  2. Inventory each tool by category (orchestration, LLM, visual, audio, rendering, publishing, logging).
  3. Flag what is genuinely no-code vs what requires integration glue.
  4. Produce a minimal PoC architecture sketch.
  5. Explicit risk section: content quality, copyright, duplicate content, YouTube policy.
- **Acceptance gates** (from issue DoD)
  - Full workflow + tool taxonomy
  - Per-category strengths/limits
  - ≥1 PoC plan
  - Risk section present
- **Support**: `@diagram` for the stage-by-stage pipeline diagram; `@reviewer` pass.

### Issue #77 — cmux / Claude Code terminal workflow research

- **Primary agent**: `@writer`
- **Deliverable**: `content/claude-code/terminal-multiplexing-claude-code-workflow.md`
- **Operational steps**
  1. Confirm whether "cmux" in the post refers to a specific project or is shorthand for a terminal multiplexer workflow.
  2. Technical comparison: cmux vs tmux vs zellij vs WezTerm workspaces vs screen.
  3. Document 4-pane pattern (agent / logs / edit-git-test / long-running monitor).
  4. Ship a minimum viable workflow recommendation with scope and limits.
- **Acceptance gates** (from issue DoD)
  - Source tool identity confirmed
  - ≥3 comparable tools documented
  - ≥1 concrete Claude Code workflow
  - Scope and limits stated
- **Support**: `@diagram` for the pane-layout illustration; `@reviewer` pass.

## Execution Handoff to `cron/git-auto.md`

`cron/git-auto.md` drives the one-issue-per-run loop. For each cycle it should:

1. Pick the lowest-numbered issue from the **queued** list above whose status is not `in_progress` and which has no open PR.
2. Branch fresh from `origin/main` per the cron invariants.
3. Delegate to the **Primary Agent** column; invoke **Support** agents only when their deliverable is explicitly listed in the operational steps.
4. Gate the PR on the issue's **Acceptance gates** — no agent completes until those bullets are satisfied.
5. On validation failure, mark `failed` in the tracker and stop the run.
6. Never bundle two issues into one branch or PR.

This dispatch file is the source of truth for which agent owns which issue in
the current cycle; update it when the queue changes rather than inventing new
routing rules inside `git-auto.md`.
