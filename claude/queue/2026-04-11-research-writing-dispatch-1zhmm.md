---
title: "Research & Writing Queue Dispatch — 2026-04-11 (1zHMM)"
---

## Context

Audit of the `wahengchang/ai-study-note` open issue queue on 2026-04-11. Filters
research and writing tasks, analyzes per-issue operational requirements,
delegates each to the best-fit agent in [`claude/config.yaml`](../config.yaml),
and hands off to [`cron/git-auto.md`](../../cron/git-auto.md) for execution.

Merging this brief initiates the next downstream `cron/git-auto.md` cycle
against the `claude/gracious-hawking-1zHMM` execution branch.

## Queue audit — 7 open issues, 4 in scope

| # | Type | Verdict | Reason |
|---|---|---|---|
| [#77](https://github.com/wahengchang/ai-study-note/issues/77) | Research → Writing | **Include** | `cmux` × Claude Code terminal workflow |
| [#76](https://github.com/wahengchang/ai-study-note/issues/76) | Research → Writing | **Include** | n8n AI YouTube automation pipeline |
| [#75](https://github.com/wahengchang/ai-study-note/issues/75) | Research → Writing | **Include** | LLM raw/wiki knowledge management — extends shipped `content/prompt-notes/karpathy-llm-wiki-pattern.md` (merged in `bc7dd17`) |
| [#74](https://github.com/wahengchang/ai-study-note/issues/74) | Writing | **Include** | Astron Agent / Serper / Jina AI / Python node / LLM — source material pre-collated |
| [#61](https://github.com/wahengchang/ai-study-note/issues/61) | Research | **Skip** | PR [#73](https://github.com/wahengchang/ai-study-note/pull/73) already in flight |
| [#67](https://github.com/wahengchang/ai-study-note/issues/67) | Layout bug | **Exclude** | Duplicate-H1 fix; PR [#68](https://github.com/wahengchang/ai-study-note/pull/68) already open; not research/writing |
| [#63](https://github.com/wahengchang/ai-study-note/issues/63) | Framework migration | **Exclude** | Mintlify engineering spike, not a content note |

## Per-issue operational requirements

### [#74](https://github.com/wahengchang/ai-study-note/issues/74) — Astron / Serper / Jina / Python node / LLM workflow roles

- **Output**: one publishable note under `content/` explaining the role and
  pricing posture of each component in an AI workflow.
- **Material readiness**: user-supplied Telegram draft already covers tool
  one-liners, pricing stance, and official links. No deep discovery required.
- **Operational risk**: pricing claims drift fast — every number must be
  verified against the vendor's current pricing page before the PR opens.
- **Non-goals**: deep implementation tutorials, full alternative comparisons.

### [#75](https://github.com/wahengchang/ai-study-note/issues/75) — LLM raw/wiki knowledge management

- **Output**: a learn note describing the `raw` (immutable source) / `wiki`
  (evolving structured knowledge) split, with the query-loop that writes back.
- **Placement call (BLOCKING)**: `content/prompt-notes/karpathy-llm-wiki-pattern.md`
  already exists (merged `bc7dd17`, closes #65). `@content-ops` must rule
  **extend-in-place vs. new sibling note** before `@writer` starts — otherwise
  we ship a duplicate.
- **Non-goals**: production architecture, exhaustive tool comparison.

### [#76](https://github.com/wahengchang/ai-study-note/issues/76) — n8n AI YouTube automation pipeline

- **Output**: research note + tool inventory + minimum-viable PoC sketch for
  the n8n × AI YouTube automation workflow from the referenced video.
- **Operational risk**: the largest surface area in this batch — 20+ tools
  across orchestration, LLM, visual, audio, rendering, and publishing stages.
- **Required split**: per stage, distinguish **"truly no-code"** from
  **"needs integration glue"**. Without that split the note is useless.
- **Mandatory callout**: copyright, duplicate-content, and YouTube policy risk.
- **Diagram**: pipeline warrants one Mermaid `flowchart LR` from `@diagram`.

### [#77](https://github.com/wahengchang/ai-study-note/issues/77) — `cmux` × Claude Code terminal workflow

- **Output**: research note on terminal-multiplexing workflows that accelerate
  Claude Code, including a comparison table across at least three tools.
- **Operational risk (BLOCKING)**: the Xiaohongshu source mentions `cmux`, but
  the post is truncated. Tool identity must be verified from a primary source
  (GitHub, author post). If identity cannot be confirmed, open the note with
  a `> [!warning]` callout — **never fabricate a tool identity**.
- **Required comparisons**: at minimum `cmux` vs. `tmux` vs. `zellij`, plus
  one of `WezTerm mux` / `screen`.

## Delegation matrix

All primary drafting routes through `@writer`. Support agents engage only where
their registered skill set is genuinely required. Every support engagement has
a named deliverable so nothing is invoked for ceremony.

| Issue | Primary | Support | Blocking gate |
|---|---|---|---|
| [#74](https://github.com/wahengchang/ai-study-note/issues/74) | `@writer` | `@reviewer`, `@content-ops` | Every pricing claim verified against the vendor's live pricing page |
| [#75](https://github.com/wahengchang/ai-study-note/issues/75) | `@writer` | `@content-ops`, `@reviewer` | `@content-ops` rules extend-vs-sibling on `content/prompt-notes/karpathy-llm-wiki-pattern.md` **before** writer starts |
| [#76](https://github.com/wahengchang/ai-study-note/issues/76) | `@writer` | `@diagram` (`flowchart LR`), `@reviewer` | Stage-by-stage no-code-vs-glue split; policy/copyright callout explicit |
| [#77](https://github.com/wahengchang/ai-study-note/issues/77) | `@writer` | `@reviewer` | `cmux` tool identity verified from primary source, or `> [!warning]` callout at top |

## Execution order

Shortest-path-to-shipped first; blocking-risk fail-fast second:

1. **[#74](https://github.com/wahengchang/ai-study-note/issues/74)** — source
   pre-collated, no upstream blockers. Ship first.
2. **[#75](https://github.com/wahengchang/ai-study-note/issues/75)** —
   `@content-ops` extend-vs-sibling gate is cheap; once cleared, the draft is
   straightforward.
3. **[#77](https://github.com/wahengchang/ai-study-note/issues/77)** —
   fail-fast on `cmux` source verification. If identity cannot be confirmed,
   the note ships with the warning callout or is marked `blocked`.
4. **[#76](https://github.com/wahengchang/ai-study-note/issues/76)** — largest
   surface area; schedule last so its scope doesn't starve the smaller issues.

## `cron/git-auto.md` handoff contract

Each downstream cycle MUST follow the invariants in [`cron/git-auto.md`](../../cron/git-auto.md):

- Fresh branch from `origin/main` named `auto/issue-<n>`.
- One issue per branch; one branch per PR.
- Stage files by explicit path — never `git add .` / `-A` / `-a`.
- `.automation/` is local state; never stage or commit it.
- Pick the lowest-numbered in-scope issue first; skip any with `in_progress`
  state or an already-open PR.
- Validate with `npm run quartz -- build` (exit 0) and `npm run check`
  before opening the PR.

## Overlap with prior dispatch PRs

Open dispatch PRs [#78](https://github.com/wahengchang/ai-study-note/pull/78),
[#79](https://github.com/wahengchang/ai-study-note/pull/79),
[#80](https://github.com/wahengchang/ai-study-note/pull/80),
[#81](https://github.com/wahengchang/ai-study-note/pull/81),
[#82](https://github.com/wahengchang/ai-study-note/pull/82), and
[#83](https://github.com/wahengchang/ai-study-note/pull/83) target the same
queue on the same day but remain unmerged. This brief is the canonical
dispatch for the `claude/gracious-hawking-1zHMM` execution branch. On merge,
the stale dispatch PRs should be closed to avoid conflicting routing
instructions to the downstream `cron/git-auto.md` runner.

## Acceptance checklist

- [ ] Reviewer confirms the filter verdicts and exclusions
- [ ] `@content-ops` rules on the [#75](https://github.com/wahengchang/ai-study-note/issues/75) extend-vs-sibling call before the writer run starts
- [ ] First downstream `cron/git-auto.md` cycle opens `auto/issue-74`
- [ ] `npm run quartz -- build` exits 0 (dispatch doc lives under `claude/`, no site impact expected)
