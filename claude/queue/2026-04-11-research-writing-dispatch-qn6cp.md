---
title: Research & Writing Queue Dispatch — 2026-04-11 (qn6cP)
---

## Purpose

Audit the open issue queue, filter to research and writing tasks, analyze
operational requirements per issue, and delegate each eligible issue to the
correct agent registered in [`claude/config.yaml`](../config.yaml). Merging
this PR initiates the downstream [`cron/git-auto.md`](../../cron/git-auto.md)
execution cycle on the `claude/gracious-hawking-qn6cP` branch.

## Scope filter — open issue queue (7 issues → 4 in scope)

| # | Kind | Verdict | Reason |
|---|---|---|---|
| wahengchang/ai-study-note#77 | Research → Writing | **Include** | `cmux` × Claude Code terminal multiplexing workflow |
| wahengchang/ai-study-note#76 | Research → Writing | **Include** | n8n AI YouTube automation pipeline inventory |
| wahengchang/ai-study-note#75 | Research → Writing | **Include** | LLM raw/wiki knowledge management — overlaps shipped `content/prompt-notes/karpathy-llm-wiki-pattern.md` (merged `bc7dd17`), needs extend-vs-sibling decision |
| wahengchang/ai-study-note#74 | Writing | **Include** | Astron Agent / Serper / Jina / Python node / LLM workflow roles — source material pre-collated |
| wahengchang/ai-study-note#61 | Research | **Skip** | PR wahengchang/ai-study-note#73 already open on `auto/issue-61`; respects `cron/git-auto.md` "one issue per branch / one branch per PR" invariant |
| wahengchang/ai-study-note#67 | Layout bug | **Exclude** | Duplicate-H1 fix (PR wahengchang/ai-study-note#68 open) — not a research or writing task |
| wahengchang/ai-study-note#63 | Framework migration | **Exclude** | Mintlify adoption is an engineering spike, not a content note |

## Operational requirements per in-scope issue

### wahengchang/ai-study-note#74 — Astron / Serper / Jina / Python node / LLM workflow roles

- **Kind**: Writing (pure authoring; source material pre-collated in the issue body)
- **Deliverable**: A single Quartz note under `content/` covering each tool's role (AI model vs. tool vs. platform vs. logic node), free-tier status, typical paid pricing, official link, and one-paragraph summary framing the whole set as workflow components, not interchangeable AI tools.
- **Blocking gate**: Every pricing claim must be verified against the vendor's live pricing page at draft time and annotated with an access date. No paraphrased pricing from the raw note.
- **Risks**: Tool positioning drift (e.g., "Serper is an AI" misconception). Writer must enforce the "workflow parts, not AI models" framing explicitly.

### wahengchang/ai-study-note#75 — LLM raw/wiki knowledge management

- **Kind**: Research → Writing
- **Deliverable**: Notes on the raw/wiki two-layer pattern (raw = immutable sources, wiki = AI-maintained structured knowledge) with query feedback loop.
- **Blocking gate**: `@content-ops` must rule on extend-vs-sibling **before** drafting. `content/prompt-notes/karpathy-llm-wiki-pattern.md` already exists (shipped `bc7dd17`, closes wahengchang/ai-study-note#65). Options:
  1. Extend the existing note with the raw/wiki layering section + query-writeback loop diagram.
  2. Create a sibling note focused on the personal-workflow angle and link bidirectionally.
- **Risks**: Duplicate content if content-ops gate is skipped. The taxonomy check must happen first.

### wahengchang/ai-study-note#76 — n8n AI YouTube automation pipeline

- **Kind**: Research → Writing
- **Deliverable**: End-to-end workflow breakdown (ideation → script → visual → audio → assembly → publish → logging), tool inventory by stage (20+ named tools), PoC architecture for a minimal viable pipeline, policy/copyright risk callout.
- **Blocking gate**: Each stage must be explicitly classified as "truly no-code" vs. "needs integration glue / custom nodes". Policy and copyright risks (YouTube ToS, duplicate content, AI-generated media) must live in a `> [!warning]` callout, not buried in prose.
- **Risks**: Largest surface area of the batch. Stage-level tool lists are easy to bloat; writer should cap each stage at 3–5 representative tools and note substitution patterns.

### wahengchang/ai-study-note#77 — cmux × Claude Code terminal multiplexing

- **Kind**: Research → Writing
- **Deliverable**: Tool identity confirmation, comparison of `cmux` vs. `tmux` / `zellij` / WezTerm mux / Warp, and a minimum-viable Claude Code pane/session workflow (agent pane / logs pane / editor pane / long-task monitor pane).
- **Blocking gate**: `cmux` tool identity must be verified from a primary source (repo, docs, or the original Xiaohongshu post). If source is unreachable (Xiaohongshu JS wall, as seen on wahengchang/ai-study-note#61), the note must open with a `> [!warning]` flagging unverified identity — never fabricate the tool's attributes.
- **Risks**: Short-link rot and JS-rendered source sites. Writer should fail fast if the upstream link cannot be resolved, rather than guessing.

## Delegation

All primary drafting routes to `@writer` (the only authoring agent registered
in [`claude/config.yaml`](../config.yaml)). Support agents engage only where
their registered skill set is genuinely required by the operational gate.

| Issue | Primary | Support | Why the support agent |
|---|---|---|---|
| wahengchang/ai-study-note#74 | `@writer` | `@reviewer`, `@content-ops` | Reviewer audits pricing accuracy; content-ops places the note per `docs/content-taxonomy.md` |
| wahengchang/ai-study-note#75 | `@content-ops` → `@writer` | `@reviewer` | Content-ops rules extend-vs-sibling on the karpathy note **first**; writer only starts after that call |
| wahengchang/ai-study-note#76 | `@writer` | `@diagram` (`flowchart LR` only), `@reviewer` | Diagram renders the stage pipeline; reviewer enforces policy callout and stage classification |
| wahengchang/ai-study-note#77 | `@writer` | `@reviewer` | Reviewer enforces source-verification gate and the `> [!warning]` fallback |

## Execution order (downstream `cron/git-auto.md` cycles)

Shortest-path-to-shipped first; blocking-risk fail-fast second:

1. **wahengchang/ai-study-note#74** — material pre-collated, only pricing verification blocks it
2. **wahengchang/ai-study-note#75** — content-ops gate upfront, then straightforward
3. **wahengchang/ai-study-note#77** — fail-fast on `cmux` source verification; cheap to stop if source is dead
4. **wahengchang/ai-study-note#76** — largest surface area, schedule last

Each downstream cycle runs under [`cron/git-auto.md`](../../cron/git-auto.md)
invariants:

- Fresh branch off `origin/main` as `auto/issue-<n>` per run.
- One issue per branch, one branch per PR.
- Explicit-path staging only — never `git add .` or `git add -A`.
- `.automation/` tracker is read-write on local disk only; never stage it.
- Verify `git diff --cached --stat` before every commit.

## Overlap with prior dispatch PRs

Dispatch PRs wahengchang/ai-study-note#78, wahengchang/ai-study-note#79,
wahengchang/ai-study-note#80, wahengchang/ai-study-note#81,
wahengchang/ai-study-note#82, wahengchang/ai-study-note#83,
wahengchang/ai-study-note#84, and wahengchang/ai-study-note#85 targeted the
same queue earlier today but remain unmerged. This brief is the canonical
dispatch for the `claude/gracious-hawking-qn6cP` execution branch. On merge,
the stale dispatch PRs should be closed to stop conflicting routing
instructions reaching the downstream `cron/git-auto.md` runner.

## Test plan

- [ ] Reviewer confirms filter verdicts and exclusions
- [ ] `@content-ops` rules on the wahengchang/ai-study-note#75 extend-vs-sibling decision **before** the writer run starts
- [ ] First downstream `cron/git-auto.md` cycle opens `auto/issue-74`
- [ ] `npm run quartz -- build` exits 0 (dispatch doc lives under `claude/`, no `content/` site impact)
