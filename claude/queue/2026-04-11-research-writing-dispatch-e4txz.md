# Research & Writing Queue Dispatch — 2026-04-11 (E4Txz)

> Canonical dispatch brief for the `claude/gracious-hawking-E4Txz` execution branch.
> Audits the open issue queue, filters to research and writing tasks, analyzes per-issue
> operational requirements, and delegates each filtered item to the best-fit agent
> registered in [`claude/config.yaml`](../config.yaml). Merging this PR initiates the
> next downstream [`cron/git-auto.md`](../../cron/git-auto.md) execution cycle.

## Audit — open issue queue (7 total → 4 in scope)

| # | Title (short) | Type | Verdict | Rationale |
|---|---|---|---|---|
| [#77](https://github.com/wahengchang/ai-study-note/issues/77) | `cmux` × Claude Code terminal workflow | Research → Writing | **Include** | Source verification required; fail-fast on tool identity |
| [#76](https://github.com/wahengchang/ai-study-note/issues/76) | n8n AI YouTube automation pipeline | Research → Writing | **Include** | Largest surface (20+ tools), pipeline + policy analysis |
| [#75](https://github.com/wahengchang/ai-study-note/issues/75) | LLM raw/wiki knowledge management | Research → Writing | **Include** | Must extend shipped `content/prompt-notes/karpathy-llm-wiki-pattern.md` (merged `bc7dd17`), not duplicate |
| [#74](https://github.com/wahengchang/ai-study-note/issues/74) | Astron / Serper / Jina / Python node / LLM positioning | Writing | **Include** | Source material pre-collated; no blockers |
| [#61](https://github.com/wahengchang/ai-study-note/issues/61) | Xiaohongshu OSS prompt optimizer | Research | **Skip** | PR [#73](https://github.com/wahengchang/ai-study-note/pull/73) already open on `auto/issue-61` — honours `cron/git-auto.md` "one issue per branch" invariant |
| [#67](https://github.com/wahengchang/ai-study-note/issues/67) | Duplicate H1 titles | Layout bug | **Exclude** | Not research/writing; PR [#68](https://github.com/wahengchang/ai-study-note/pull/68) already open |
| [#63](https://github.com/wahengchang/ai-study-note/issues/63) | Adopt Mintlify framework | Framework migration | **Exclude** | Engineering spike, not a content note |

## Operational requirements per filtered issue

### [#74](https://github.com/wahengchang/ai-study-note/issues/74) — Astron / Serper / Jina / Python / LLM workflow roles

- **Deliverable**: one Quartz note positioning each component as a workflow part (model vs tool vs platform vs logic node), with pricing and official links.
- **Target path candidate**: `content/prompt-notes/ai-workflow-component-roles.md` (final placement gated by `@content-ops`).
- **Hard gate**: every pricing claim verified against the vendor's live pricing page on the day of writing. No "free tier" claims without a direct quote.
- **Audience**: non-technical reader first; one plain-language pass before any table.

### [#75](https://github.com/wahengchang/ai-study-note/issues/75) — LLM raw/wiki knowledge management

- **Deliverable**: learn note explaining raw (immutable source) vs wiki (curated knowledge) separation, AI-driven consolidation loop, and low-barrier implementation with IDE + Obsidian + Markdown + Git.
- **Extend-vs-sibling**: the merged `content/prompt-notes/karpathy-llm-wiki-pattern.md` already covers the Karpathy reference. `@content-ops` **must** rule whether this issue extends that file or lives as a sibling note **before** `@writer` begins drafting.
- **Hard gate**: raw/wiki distinction kept crisp — never conflate "素材" with "知識".

### [#76](https://github.com/wahengchang/ai-study-note/issues/76) — n8n AI YouTube automation pipeline

- **Deliverable**: research note decomposing the end-to-end pipeline (ideation → script → visual → audio → render → publish → log) with per-stage tool inventory, PoC architecture, and policy/copyright callouts.
- **Target path candidate**: `content/claude-code/tools-and-skills/n8n-youtube-automation-pipeline.md`.
- **Hard gate**: every stage explicitly marks "truly no-code" vs "needs integration glue". YouTube policy, copyright, and duplicate-content risks must appear in a dedicated `> [!warning]` callout — not buried in prose.

### [#77](https://github.com/wahengchang/ai-study-note/issues/77) — `cmux` × Claude Code terminal workflow

- **Deliverable**: study note on terminal multiplexing / session management for Claude Code productivity, with a tool comparison table and a minimum-viable workflow.
- **Hard gate**: `cmux` tool identity verified from a primary source (the Xiaohongshu link is typically auth-walled). If the link cannot be followed, the note opens with a `> [!warning]` clearly stating which tool(s) were assumed, and offers candidates rather than asserting a single identity.
- **Comparison scope**: minimum 3 comparable tools — `tmux`, `zellij`, and at least one of `screen` / WezTerm mux / Warp workspace.

## Delegation — primary + support per issue

All primary drafting routes through `@writer` (the only agent in `claude/config.yaml`
whose description is authoring). Support agents engage only where their registered
skill set is genuinely required.

| Issue | Primary | Support | Blocking gate |
|---|---|---|---|
| [#74](https://github.com/wahengchang/ai-study-note/issues/74) | `@writer` | `@reviewer`, `@content-ops` | Pricing claims verified against vendor pricing pages |
| [#75](https://github.com/wahengchang/ai-study-note/issues/75) | `@writer` | `@content-ops`, `@reviewer` | `@content-ops` rules extend-vs-sibling on `karpathy-llm-wiki-pattern.md` **before** writer starts |
| [#76](https://github.com/wahengchang/ai-study-note/issues/76) | `@writer` | `@diagram` (`direction LR` only), `@reviewer` | Stage-level "no-code vs integration glue" split; policy/copyright callout explicit |
| [#77](https://github.com/wahengchang/ai-study-note/issues/77) | `@writer` | `@reviewer` | `cmux` tool identity verified from primary source, or top-of-note `> [!warning]` callout |

## Execution order

Shortest-path-to-shipped first, blocking-risk fail-fast second:

1. **[#74](https://github.com/wahengchang/ai-study-note/issues/74)** — source pre-collated, no upstream blockers.
2. **[#75](https://github.com/wahengchang/ai-study-note/issues/75)** — `@content-ops` extend-vs-sibling gate resolves quickly, then straightforward.
3. **[#77](https://github.com/wahengchang/ai-study-note/issues/77)** — fail-fast on `cmux` source verification; if unresolvable, ship with warning callout rather than blocking the queue.
4. **[#76](https://github.com/wahengchang/ai-study-note/issues/76)** — largest surface area, most tool-inventory churn, schedule last.

Each downstream cycle runs under [`cron/git-auto.md`](../../cron/git-auto.md)
invariants:

- fresh branch off `origin/main` as `auto/issue-<n>`
- one issue per branch, one branch per PR
- explicit-path staging only — never `git add -A` / `git add .`
- `.automation/` never staged
- working tree must be clean before starting
- every decision recorded in the tracker

## Overlap with prior dispatch PRs

Dispatch PRs
[#78](https://github.com/wahengchang/ai-study-note/pull/78),
[#79](https://github.com/wahengchang/ai-study-note/pull/79),
[#80](https://github.com/wahengchang/ai-study-note/pull/80),
[#81](https://github.com/wahengchang/ai-study-note/pull/81),
[#82](https://github.com/wahengchang/ai-study-note/pull/82),
[#83](https://github.com/wahengchang/ai-study-note/pull/83), and
[#84](https://github.com/wahengchang/ai-study-note/pull/84)
targeted the same queue on the same day but remain unmerged. This brief is the
canonical dispatch for the `claude/gracious-hawking-E4Txz` execution branch; on
merge, the stale dispatch PRs should be closed to avoid conflicting routing
instructions to the downstream `cron/git-auto.md` runner.

## Test plan

- [ ] Reviewer confirms the filter verdicts and exclusions
- [ ] `@content-ops` rules on the #75 extend-vs-sibling call before the writer run starts
- [ ] First downstream `cron/git-auto.md` cycle opens `auto/issue-74`
- [ ] `npm run quartz -- build` exits 0 (dispatch doc lives under `claude/`, no site impact)
