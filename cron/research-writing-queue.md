# Research & Writing Queue — Triage & Delegation

> **Purpose**: Seed input for `./cron/git-auto.md`. Lists the filtered research/writing issues, their operational requirements, and the agent delegated to each. The cron picks **one issue per run, lowest number first** (see `git-auto.md` §4).

## Filter criteria

- Label set includes `documentation` **or** `enhancement` **and** issue body describes a study note, research note, or writing deliverable.
- Excluded: layout/theme bugs (#67), framework-adoption planning (#63) — these route to separate tracks.

## Filtered queue (5 issues)

| # | Title (short) | Type | Primary agent | Secondary | Priority |
|---|---|---|---|---|---|
| 61 | 小紅書 prompt auto-optimization research | Research | `@writer` | `@reviewer` | P1 (next) |
| 74 | Astron Agent / Serper / Jina AI study note | Writing | `@writer` | `@content-ops`, `@reviewer` | P2 |
| 75 | LLM raw/wiki knowledge management note | Research + Writing | `@writer` | `@reviewer` | P3 |
| 76 | n8n AI YouTube automation workflow | Research | `@writer` | `@diagram`, `@reviewer` | P4 |
| 77 | cmux terminal multiplexing for Claude Code | Research | `@writer` | `@content-ops`, `@reviewer` | P5 |

## Operational analysis

### #61 — 小紅書 prompt auto-optimization research

- **Inputs**: XHS short link only; no confirmed repo identity.
- **Ops**: (1) Resolve short link → original post → candidate project (likely `promptperfect`, `APE`, or `DSPy` family). (2) Capture repo URL, TL;DR, core features, applicable scenarios. (3) Judge fit for `ai-study-note`.
- **Blockers**: If link fails to resolve → mark `clarification_needed`, ask user to re-share.
- **Delivery**: `content/prompt-notes/<kebab-slug>.md` with frontmatter `title`, Context, Key Findings (≥3), Decision.
- **Agent**: `@writer` — research + publishable note. `@reviewer` final pass.

### #74 — Astron Agent / Serper / Jina AI / Python node / LLM

- **Inputs**: User-supplied Telegram-sourced draft already covers role, pricing, links per tool.
- **Ops**: Restructure into a single note. Non-technical tone required. Add a "workflow roles ≠ interchangeable AI tools" framing section. Include a free-tier vs paid breakdown table.
- **Blockers**: None — all source material is in the issue body.
- **Delivery**: `content/prompt-notes/ai-workflow-components.md` (or equivalent).
- **Agent**: `@writer` — pure distillation. `@content-ops` validates taxonomy placement. `@reviewer` final pass.

### #75 — LLM raw/wiki knowledge management

- **Inputs**: User speech-script + Karpathy / 林穎俊 references.
- **Ops**: Extract the two-layer pattern (raw = immutable source, wiki = evolving structured notes). Document write-back loop. Link to IDE + Obsidian + Markdown + Git tooling stack.
- **Blockers**: None.
- **Delivery**: `content/claude-code/llm-knowledge-raw-wiki.md` (or `prompt-notes/`).
- **Agent**: `@writer` — design-pattern note. `@reviewer` final pass.

### #76 — n8n AI YouTube automation workflow

- **Inputs**: YouTube video + explicit tool list already in issue.
- **Ops**: (1) End-to-end workflow decomposition (ideation → script → visual → audio → assembly → publish → monitoring). (2) Tool matrix by category. (3) PoC sketch — minimal viable integration. (4) Risk section (copyright, YT policy, content quality).
- **Blockers**: None — tool list is pre-filled.
- **Delivery**: `content/seo-and-geo/<slug>.md` or new `content/automation/` (taxonomy check required first).
- **Agent**: `@writer` primary. `@diagram` for the workflow LR Mermaid. `@content-ops` for folder decision (may trigger STOP-and-ask if no folder fits).

### #77 — cmux terminal multiplexing for Claude Code

- **Inputs**: XHS short link; candidate tool identity unclear (`cmux` is ambiguous — could be a standalone project, a fork, or the author mis-typing `tmux`).
- **Ops**: (1) Resolve short link, verify tool identity. (2) Compare with `tmux`, `zellij`, `screen`, WezTerm mux. (3) Document multi-pane Claude Code workflow (agent / logs / editor / monitor). (4) Output a minimal workflow recipe.
- **Blockers**: If short link dead → `clarification_needed`.
- **Delivery**: `content/claude-code/terminal-multiplexing-workflow.md`.
- **Agent**: `@writer` primary. `@content-ops` for placement. `@reviewer` final pass.

## Execution contract (for `cron/git-auto.md`)

Per `git-auto.md` invariants — the cron picks exactly one issue per run, lowest number first, branching fresh from `origin/main` as `auto/issue-<n>`.

**Next-run target**: issue **#61**. Agent: `@writer`.

**Per-issue cron checklist** (applies to every dequeued issue):

1. Preflight: clean working tree, `git fetch origin`, `.automation/` untracked.
2. Branch: `git checkout -B auto/issue-<n> origin/main`.
3. Delegate body work to the primary agent above; secondary agents run as validation passes.
4. Validate: `npm run check` + `npm run quartz -- build` must exit 0.
5. Stage by explicit path only — never `.automation/`, never `git add -A`.
6. Commit → push → open one PR → mark `pr_open` in the tracker.
7. On validation failure → mark `failed`; on ambiguity → `clarification_needed`.

## Out of scope for this queue

- #67 duplicate-title bug → layout/content fix, routed separately.
- #63 Mintlify adoption → architecture decision, not a writing task.
