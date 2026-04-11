---
title: Research & Writing Queue Dispatch (AuUYa)
---

## Context

Audit of the open issue queue filtered to research- and writing-shaped work,
with each issue mapped to the appropriate agent under `claude/agents/` so the
`cron/git-auto.md` execution loop can consume one item per run.

- **Audit date**: 2026-04-11
- **Source**: `mcp__github__list_issues` — `wahengchang/ai-study-note`, state=OPEN
- **Execution protocol**: [`cron/git-auto.md`](./git-auto.md)
- **Branch**: `claude/gracious-hawking-AuUYa`

## Filter Criteria

Included when the issue body asks for note authoring, research write-up,
source investigation, or structured content delivery. Excluded when the issue
is a site bug, layout change, or framework migration.

## Filtered Queue

Ordered by issue number ascending, matching `git-auto.md` §4 ("lowest number
first").

| Order | Issue | Title (short) | State | Primary agent | Support |
|-------|-------|---------------|-------|---------------|---------|
| 1 | #61 | 小紅書 prompt optimizer research | PR #73 open (skip) | `@writer` | `@reviewer` |
| 2 | #74 | Astron Agent / Serper / Jina AI study note | open | `@writer` | `@content-ops`, `@reviewer` |
| 3 | #75 | LLM raw/wiki knowledge-management learn note | open | `@writer` | `@diagram`, `@content-ops`, `@reviewer` |
| 4 | #76 | n8n AI YouTube automation workflow research | open | `@writer` | `@diagram`, `@content-ops`, `@reviewer` |
| 5 | #77 | cmux × Claude Code terminal multiplexing research | open | `@writer` | `@content-ops`, `@reviewer` |

**Out of scope** (not research/writing):

- **#67** — duplicate H1 bug on rendered pages (layout/content convention fix).
- **#63** — evaluate Mintlify as a replacement framework (infra planning).

## Per-Issue Operational Analysis

### #74 — Astron Agent / Serper / Jina AI / Python node / LLM workflow note

- **Skill need**: writing + taxonomy placement. Source material is already in
  hand (Telegram triage note). No external research required.
- **Agent plan**:
  - `@writer` — draft the note with a plain-language framing that separates
    model vs. tool vs. platform vs. logic node, plus pricing column.
  - `@content-ops` (Intake mode) — propose folder/tag placement under
    `content/` per `docs/content-taxonomy.md`.
  - `@reviewer` — pass for accuracy of pricing claims and tool positioning.
- **Deliverable**: one note under `content/<topic>/` with a small pricing/
  positioning comparison table.
- **Risks**: stale free-tier information; flag with `> [!warning]` if uncertain.

### #75 — LLM-based raw/wiki knowledge management learn note

- **Skill need**: synthesis of user-supplied prose + Karpathy / 林穎俊 references
  into a clean learn note. Conceptual, not hands-on.
- **Agent plan**:
  - `@writer` — frame the two-layer (raw vs. wiki) model and why it works for
    personal KM; cite sources inline.
  - `@diagram` — one `flowchart LR` showing raw → AI synthesis → wiki → query
    loop → wiki write-back.
  - `@content-ops` — place under the knowledge-management / learn-note branch
    of the taxonomy.
  - `@reviewer` — structural and style pass.
- **Deliverable**: one learn note with a single LR diagram.
- **Risks**: avoid turning this into a product spec — keep it conceptual.

### #76 — n8n AI YouTube automation research note

- **Skill need**: deep research write-up with heavy tool inventory and a PoC
  sketch. Largest scope in the queue.
- **Agent plan**:
  - `@writer` — decompose the video workflow into stages (ideation → script →
    visuals → audio → assembly → publish → monitoring) with per-stage tool
    tables.
  - `@diagram` — one `flowchart LR` for the end-to-end pipeline (4–6 nodes,
    no TD).
  - `@content-ops` — classify as research note; propose tags from the closed
    vocabulary (automation, video, n8n).
  - `@reviewer` — verify tool claims (free tier, API cost framing) and flag
    YouTube TOS / copyright risks.
- **Deliverable**: research note + tool inventory table + minimal PoC sketch.
- **Risks**: scope creep — cap the tool inventory at the categories already
  listed in the issue.

### #77 — cmux × Claude Code terminal multiplexing research

- **Skill need**: source verification (小紅書 post) before any drafting, then a
  compact comparison.
- **Agent plan**:
  - `@writer` — once the referenced tool identity is verified, draft the
    study note with a workflow comparison (cmux / tmux / zellij / WezTerm
    mux) and a minimal Claude Code pane layout recipe.
  - `@content-ops` — place under workflow / tooling section.
  - `@reviewer` — verify terminology and that the Claude Code recipe is
    reproducible.
- **Deliverable**: study note + comparison table + one recommended pane layout.
- **Risks**: `cmux` may resolve to multiple projects — `@writer` must confirm
  the intended tool before publishing claims.

## Delegation Summary

```text
#74 → @writer → @content-ops → @reviewer
#75 → @writer → @diagram → @content-ops → @reviewer
#76 → @writer → @diagram → @content-ops → @reviewer
#77 → @writer → @content-ops → @reviewer
```

`@writer` is the primary author for every item; `@diagram` is pulled in only
when a multi-stage flow benefits from one LR flowchart; `@content-ops` runs in
Intake mode for placement; `@reviewer` is the final gate.

## Execution Contract (per `cron/git-auto.md`)

Each subsequent run picks **one** issue from the filtered queue in order:

1. Preflight: `git fetch origin`, clean working tree, verify branch state.
2. Skip #61 — PR #73 already open.
3. Start with #74 (lowest open issue without a PR).
4. Branch fresh: `git checkout -B auto/issue-<n> origin/main`.
5. Delegate to the mapped agents above; stage files by explicit path only;
   never touch `.automation/`.
6. Commit, push, open one PR, record result in the tracker.
7. Stop after one issue per run.
