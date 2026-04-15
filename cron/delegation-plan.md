# Issue Delegation Plan — Research & Writing Queue

> **Purpose**: Initiation manifest for [`cron/git-auto.md`](./git-auto.md). The cron loop reads this list and processes one issue per run (lowest number first), branching `auto/issue-<n>` from fresh `origin/main`.

## Audit Snapshot

- **Generated**: 2026-04-15
- **Source**: `mcp__github__list_issues` on `wahengchang/ai-study-note`, state `OPEN`
- **Total open issues**: 6
- **Filter**: research and writing tasks (labels `documentation`, `enhancement`, or body explicitly requests a study/research/learn note)
- **In scope**: 5 issues (#61, #74, #75, #76, #77)
- **Out of scope**: 1 issue (#67 — bug fix on layout/template, deferred to engineering queue)

## Filtered Queue (process in ascending issue number)

### #61 — Research 寶藏開源項目 (auto-prompt-optimizer)
- **Type**: Research → short note
- **Source**: 小紅書 link only; project identity unconfirmed
- **Operational requirements**:
  - Resolve the actual repo behind the post (likely a prompt-optimization OSS project)
  - 3–5 line TL;DR, core features, applicable scenarios
  - Verdict: include in `ai-study-note` or not
- **Risk**: source link may be dead; requires web fetch + cross-reference
- **Delegated agent**: `@writer`
- **Rationale**: Output is a research-style Quartz note (short, evidence-based). Writer enforces frontmatter, `Context → Key Findings` template, and the Quality Checklist.
- **Target path**: `content/prompt-notes/<slug>.md`

### #74 — Study note: Astron Agent / Serper / Jina AI / Python node / LLM
- **Type**: Writing (source material already drafted by user)
- **Operational requirements**:
  - Restructure the user's Telegram draft into a publishable note
  - Per-tool: one-line position, free vs paid model, official link
  - Closing section reframing the diagram as workflow components, not a single AI tool
  - Plain-language tone; non-technical reader friendly
- **Risk**: low — content already exists, mostly editorial
- **Delegated agent**: `@writer`
- **Rationale**: Pure note authoring with structured per-tool sections. Writer's `Architect` objective applies (component decomposition).
- **Target path**: `content/claude-code/<slug>.md` or `content/prompt-notes/<slug>.md` — `@content-ops` to confirm placement against `docs/content-taxonomy.md` post-draft.

### #75 — Learn note: LLM-based knowledge management (raw / wiki workflow)
- **Type**: Research → learn note
- **Operational requirements**:
  - Capture the two-layer raw/wiki separation pattern
  - Reference Andrej Karpathy and 林穎俊 prior art
  - IDE + Obsidian + Markdown + Git as low-friction stack
  - Outline how query results feed back into wiki
- **Risk**: medium — must avoid scope creep into product-design territory (explicitly out of scope per issue)
- **Delegated agent**: `@writer` (primary) → `@diagram` (secondary, for raw→wiki→query flow)
- **Rationale**: Writer composes the note; Diagram contributes one Mermaid `flowchart LR` showing the raw → wiki → query → wiki feedback loop.
- **Target path**: `content/claude-code/<slug>.md`

### #76 — Research: AI YouTube automation workflow (n8n)
- **Type**: Research → tool-inventory note
- **Operational requirements**:
  - Decompose the end-to-end pipeline (ideation → script → visuals → audio → assembly → publish → telemetry)
  - Tool table per category (orchestration, LLM, visual, audio, render, publish, storage)
  - Cost / risk / copyright / platform-policy section
  - One PoC architecture sketch (minimum viable)
- **Risk**: medium — large surface area, must resist exhaustive coverage
- **Delegated agent**: `@writer` (primary) → `@diagram` (secondary, for the PoC architecture sketch)
- **Rationale**: Writer for the inventory + risk analysis; Diagram for one `flowchart LR` of the minimal PoC pipeline.
- **Target path**: `content/claude-code/<slug>.md` — `@content-ops` to confirm taxonomy fit (may belong under a new tooling subfolder; if so, stop and ask).

### #77 — Research: terminal multiplexing for Claude Code (cmux)
- **Type**: Research → comparison note
- **Operational requirements**:
  - Identify the actual `cmux` referenced by the post
  - Contrast with `tmux`, `zellij`, WezTerm mux, etc.
  - Document Claude Code multi-pane patterns (agent / logs / edit / long-running)
  - Comparison table + minimum recommended workflow
- **Risk**: medium — `cmux` is ambiguous; multiple OSS projects share the name
- **Delegated agent**: `@writer` (primary) → `@diagram` (secondary, for pane-layout sketch if it adds clarity per the diagram-only-when-needed rule)
- **Rationale**: Writer authors the comparison; Diagram considered but optional — pane-layout is often clearer as ASCII or a Smart Columns block than as Mermaid.
- **Target path**: `content/claude-code/<slug>.md`

## Out of Scope

### #67 — Fix duplicate article titles
- **Type**: Bug fix (Quartz layout / frontmatter convention)
- **Action**: Defer. Not a research/writing task. Route through normal engineering queue or a dedicated `@content-ops` audit run; the cron loop will skip per its own "small and actionable" criteria if classified as a code/template fix.

## Agent → Issue Matrix

| Agent | Primary | Secondary |
|---|---|---|
| `@writer` | #61, #74, #75, #76, #77 | — |
| `@diagram` | — | #75, #76, #77 (only if visualization adds clarity) |
| `@content-ops` | — | #74, #76 (post-draft placement check against `docs/content-taxonomy.md`) |
| `@reviewer` | — | All five — final pass before PR ready-for-review |

## Execution Contract for `cron/git-auto.md`

Per the invariants in `git-auto.md`:

1. The cron run picks **#61 first** (lowest number), then #74, #75, #76, #77 across subsequent runs.
2. Each issue → fresh branch `auto/issue-<n>` off `origin/main`. **Never** branch from the current `claude/gracious-hawking-Zj54Z` HEAD.
3. One issue per run. One PR per branch.
4. `.automation/issues.json` remains local-only — never staged.
5. Files staged by explicit path; no `git add -A`.
6. Each PR must pass `npm run check` and `npm run quartz -- build` before being marked ready.

This document itself is the **only** file added on `claude/gracious-hawking-Zj54Z`. It does not modify any issue branch and does not pre-empt the cron loop's per-run branching contract.
