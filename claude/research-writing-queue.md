# Research & Writing Dispatch Queue

> Queue consumed by [`cron/git-auto.md`](../cron/git-auto.md). One issue per run, lowest number first. Agents referenced here live in `claude/agents/` and are registered in [`config.yaml`](./config.yaml).

## Scope

Filter applied against the open issue queue: **research** and **writing** intents only. Non-authoring work (bug fixes, layout, infra) is excluded from this queue and routed elsewhere.

- Included labels/intent: `documentation`, `enhancement` on issues whose acceptance criteria produce a study / research note under `content/`.
- Excluded: pure bug fixes, template/layout work, refactors with no authoring artifact (e.g. `#67` — title rendering bug → routed to `@content-ops` / layout track, not this queue).

## Dispatch Table

| Order | Issue | Intent | Primary Agent | Support | Deliverable |
|-------|-------|--------|---------------|---------|-------------|
| 1 | [#61](https://github.com/wahengchang/ai-study-note/issues/61) | Research (source verification + summary) | `@writer` | `@reviewer` | Research note: prompt-optimization OSS project |
| 2 | [#74](https://github.com/wahengchang/ai-study-note/issues/74) | Writing (structured study note) | `@writer` | `@reviewer` | Study note: Astron Agent / Serper / Jina / Python node / LLM workflow roles |
| 3 | [#75](https://github.com/wahengchang/ai-study-note/issues/75) | Research + writing (concept note) | `@writer` | `@reviewer` | Learn note: raw/wiki two-layer LLM knowledge management |
| 4 | [#76](https://github.com/wahengchang/ai-study-note/issues/76) | Research (workflow dissection) | `@writer` | `@diagram`, `@reviewer` | Research note: n8n AI YouTube automation workflow + tool taxonomy + PoC sketch |
| 5 | [#77](https://github.com/wahengchang/ai-study-note/issues/77) | Research (tool comparison) | `@writer` | `@diagram`, `@reviewer` | Research note: terminal multiplexing (cmux/tmux/zellij) × Claude Code workflow |

Processing order matches the `git-auto.md` invariant: **lowest number first, one issue per branch, one branch per PR**.

## Per-Issue Operational Requirements

### #61 — Prompt-optimization OSS research
- **Classification**: Architect / research summary.
- **Inputs**: Xiaohongshu link `http://xhslink.com/o/7iAalKtM6SX` (subject unverified — agent must identify the actual OSS project first).
- **Critical steps**:
  1. Source verification — confirm the exact repo/project the post references before writing.
  2. TL;DR (3–5 lines), core features, applicable scenarios, 3 reusable takeaways.
  3. Explicit verdict on whether to absorb further into `ai-study-note`.
- **Placement**: `content/prompt-notes/` (subject to `docs/content-taxonomy.md`).
- **Risk**: If source cannot be resolved, stop and mark `clarification_needed` per `git-auto.md` step 4.

### #74 — Astron Agent / Serper / Jina / Python node / LLM study note
- **Classification**: Architect-style reference note.
- **Inputs**: User-supplied Telegram note covering each component's role + pricing.
- **Critical steps**:
  1. Tabulate: component → type (model / tool / platform / logic node) → free tier → pricing → official link.
  2. Explain workflow composition (not "one AI tool" — distinct parts).
  3. Keep one plain-language pass for non-technical readers.
- **Placement**: `content/ai-workflow/` or closest existing folder per taxonomy.

### #75 — raw/wiki LLM knowledge management
- **Classification**: Architect (design rationale).
- **Inputs**: User narrative + Karpathy / 林穎俊 references.
- **Critical steps**:
  1. Articulate the raw (immutable source) vs. wiki (curated, evolving) separation and why it matters.
  2. Describe the LLM's role in raw → wiki conversion, cross-linking, summarization.
  3. Outline query-and-writeback loop; enumerate advantages for personal KM.
- **Out of scope**: no full product build, no exhaustive tool comparison.

### #76 — n8n AI YouTube automation research
- **Classification**: Architect + deploy (workflow dissection).
- **Inputs**: YouTube URL `https://www.youtube.com/watch?v=5Htbfh_LYSE`.
- **Critical steps**:
  1. Decompose end-to-end pipeline (ideation → script → visuals → audio → assembly → publish → telemetry).
  2. Tool taxonomy table (orchestration, LLM, visual, audio, render, publish, storage).
  3. Minimum-viable PoC sketch — call out `@diagram` for an `LR` flowchart.
  4. Explicit risk section: content quality, copyright, duplicate-content, YouTube policy.
- **Dependency**: `@diagram` for the workflow diagram (LR orientation per project rules).

### #77 — Terminal multiplexing × Claude Code research
- **Classification**: Architect + optimize.
- **Inputs**: Xiaohongshu link `http://xhslink.com/o/AAbGLpO7BY4`.
- **Critical steps**:
  1. Identify what "cmux" actually refers to in the original post (tool disambiguation).
  2. Compare ≥3 of: cmux, tmux, zellij, WezTerm mux, Warp.
  3. Produce one concrete Claude Code workflow (agent pane / logs pane / edit-test pane / long-running monitor pane).
  4. Call out applicability and limits.
- **Dependency**: `@diagram` for tool-comparison / pane-layout diagram.

## Agent → Skillset Rationale

| Agent | Why this queue uses it |
|-------|------------------------|
| `@writer` | Primary author for every issue — all deliverables are Quartz Markdown notes with frontmatter, evidence-based claims, and the note-type schema (architect / debug / deploy / optimize). |
| `@diagram` | Mermaid `LR` diagrams for #76 (workflow architecture) and #77 (pane layout / tool comparison). |
| `@reviewer` | Mandatory pre-merge audit for accuracy, style compliance, and completeness before each PR flips to `ready for review`. |
| `@content-ops` | Not used in this queue, but owns placement disputes — if any issue's note landing folder is ambiguous vs. `docs/content-taxonomy.md`, the writer must stop and hand off. |

## Execution Contract (binds to `cron/git-auto.md`)

1. **One issue per run, lowest number first.** The runner picks from the Dispatch Table top-down, skipping any issue already in `in_progress` or with an open PR.
2. **Fresh branch off `origin/main`.** `git fetch origin && git checkout -B auto/issue-<n> origin/main` — never reuse stale locals.
3. **Tracker is local-only.** `.automation/issues.json` is read-write on disk and **never staged**. Stage files by explicit path only; no `git add .` / `-A` / `-a`.
4. **Clarification path.** If source material cannot be resolved (notably #61 and #77, where the Xiaohongshu link must be de-referenced), the agent posts a clarification comment on the issue, marks `clarification_needed`, and stops.
5. **Pre-PR validation.** `npm run quartz -- build` must exit 0; `npm run check` should pass. `@reviewer` output attached to the PR description.
6. **One branch → one PR → one issue.** No bundling; unrelated work spawns a separate issue.

## Not in this queue

- `#67` — duplicate article titles → layout/content-convention fix, handled outside the research/writing track. Owner: `@content-ops` + layout change in `quartz.layout.ts`.
