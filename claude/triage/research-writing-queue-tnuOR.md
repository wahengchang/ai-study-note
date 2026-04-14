---
title: Research & Writing Queue Triage (tnuOR)
---

## Purpose

Audit of the open issue queue for `wahengchang/ai-study-note`, filtered to
**research** and **writing** tasks. Each filtered issue is mapped to an
operational spec and delegated to the agent whose skill set matches the
deliverable. This document seeds the execution workflow defined in
[`cron/git-auto.md`](../../cron/git-auto.md): one issue per run,
lowest-number-first, one branch per issue, one PR per branch.

## Source Audit

- **Total open issues audited**: 7 (#61, #63, #67, #74, #75, #76, #77)
- **Audit date**: 2026-04-14
- **Triage branch**: `claude/gracious-hawking-tnuOR`

## Filter

**In scope — research / writing (produce a Markdown note under `content/`)**:

- #61, #74, #75, #76, #77

**Out of scope — not research / writing**:

- **#63** Adopt Mintlify as new framework — site-architecture / migration
  evaluation. Not content authoring; requires a framework-evaluation spike
  and a content-migration plan, not `@writer`.
- **#67** Fix duplicate article titles — layout / template bug touching
  Quartz frontmatter rendering. Belongs to `@content-ops` plus possible
  `quartz.layout.ts` tweaks, not content authoring.

## In-Flight Check (skip issues with an existing open PR)

Queried open PRs on `wahengchang/ai-study-note` for `closes #<n>`:

| Issue | Existing open PR | Status |
|-------|------------------|--------|
| #61 | #73 (`auto/issue-61`) | **In flight** — skip for fresh work |
| #74 | #121 (`auto/issue-74`) | **In flight** — skip |
| #75 | #120 (`claude/gracious-hawking-u3PI2`) | **In flight** — skip |
| #76 | none | **Eligible** |
| #77 | none | **Eligible** |

## Execution Order (lowest-number first, per `cron/git-auto.md`)

| # | Issue | Title (short) | Primary Agent | Support | Eligible next run |
|---|-------|---------------|---------------|---------|-------------------|
| 1 | #61 | Xiaohongshu open-source prompt optimizer | `@writer` | `@reviewer` | No — PR #73 open |
| 2 | #74 | Astron Agent / Serper / Jina / Python / LLM workflow note | `@writer` | `@reviewer`, `@content-ops` | No — PR #121 open |
| 3 | #75 | Raw/Wiki LLM knowledge management workflow | `@writer` | `@reviewer` | No — PR #120 open |
| 4 | **#76** | n8n AI YouTube automation workflow research | `@writer` | `@diagram`, `@reviewer` | **Yes — pick first** |
| 5 | #77 | cmux / terminal multiplexing for Claude Code | `@writer` | `@reviewer` | Yes — pick after #76 |

## Per-Issue Operational Spec

### #61 — Xiaohongshu: open-source prompt optimizer

- **Agent**: `@writer` (tool-survey authoring)
- **Required inputs**: original Xiaohongshu URL, candidate repo identification
- **Deliverable**: `content/prompt-notes/<kebab-case>.md`
- **Sections**: Context; Key findings (TL;DR + repo + 3 reusable points);
  Setup + representative prompt-optimization run; Applicability verdict
- **Acceptance (from issue)**: confirmed upstream project, 3+ reusable points,
  explicit recommendation on ai-study-note inclusion
- **Status**: in flight on PR #73 — do not dispatch

### #74 — Astron Agent / Serper / Jina / Python node / LLM

- **Agent**: `@writer` (workflow-parts breakdown)
- **Required inputs**: user Telegram-group draft (already in issue body)
- **Deliverable**: Markdown note — folder confirmed by `@content-ops` against
  `docs/content-taxonomy.md`; likely `content/prompt-notes/` or a dedicated
  `content/ai-workflow/` folder
- **Sections**: Context; Per-tool one-liner + role + pricing; Comparison
  table (tool × category × free-tier × official link); "Not one AI, but
  workflow parts" summary
- **Acceptance (from issue)**: title, publishable outline/draft, unambiguous
  pricing/role per tool, explicit framing as workflow parts
- **Status**: in flight on PR #121 — do not dispatch

### #75 — Raw/Wiki LLM knowledge management

- **Agent**: `@writer` (system-design authoring)
- **Required inputs**: user Facebook share + Chinese narrative in issue;
  cross-reference existing Karpathy note merged via #69
- **Deliverable**: Markdown note under `content/claude-code/` or a
  taxonomy-confirmed folder
- **Sections**: Context; Core design (raw vs. wiki layer); Flow (ingest →
  organize → query → write-back); Why it suits personal KM; Minimum viable
  IDE + Obsidian + Markdown + Git implementation path
- **Acceptance (from issue)**: explicit topic + outline, raw/wiki value
  articulated, extensible to downstream query/idea-generation usage
- **Status**: in flight on PR #120 — do not dispatch

### #76 — n8n AI YouTube automation workflow  ← NEXT PICK

- **Primary agent**: `@writer` (research note authoring)
- **Support**: `@diagram` (workflow Mermaid, `direction LR`); `@reviewer`
  (post-draft audit)
- **Required inputs**: source YouTube URL in issue; tool list already
  enumerated in issue (orchestration / LLM / visual / audio / render /
  publish / storage)
- **Deliverable**: research note under `content/ai-workflow/` (path subject
  to `@content-ops` taxonomy confirmation) + tool-category table + MVP PoC
  architecture sketch
- **Diagram**: Mermaid `flowchart LR`; 4–6 primary nodes (topic → script →
  visual → audio → assembly → publish → log); respect project brand tokens
- **Sections**: Context; End-to-end workflow breakdown; Tool inventory by
  category; PoC (MVP) architecture; Risks (content quality, copyright,
  YouTube policy, duplicate content, cost structure)
- **Acceptance (from issue)**: full workflow + per-tool category rationale,
  at least one PoC plan, explicit risk section
- **Branch (per `cron/git-auto.md`)**: `auto/issue-76` fresh from
  `origin/main`; one PR that closes #76 only

### #77 — cmux / terminal multiplexing for Claude Code

- **Primary agent**: `@writer` (tool-comparison authoring)
- **Support**: `@reviewer`
- **Required inputs**: original Xiaohongshu post confirmation; real project
  identity behind the `cmux` reference (disambiguate from generic tmux)
- **Deliverable**: Markdown note under `content/claude-code/`
- **Sections**: Context; Tool identification; Comparison table (cmux, tmux,
  zellij, WezTerm mux, candidates); Why multiplexing helps Claude Code
  (pane-per-role pattern); Minimum viable workflow; Limitations
- **Acceptance (from issue)**: identified upstream tool, 3+ comparable
  tools, 1 actionable Claude Code workflow, explicit limits
- **Branch (per `cron/git-auto.md`)**: `auto/issue-77` fresh from
  `origin/main` on the run **after** #76 closes

## Delegation Summary by Agent

- **`@writer`** → #61, #74, #75, #76, #77 (all primary authorship)
- **`@diagram`** → #76 (workflow Mermaid, `direction LR` only)
- **`@reviewer`** → post-draft audit on every note (BLOCK / WARN / INFO)
  before the note PR is marked ready for review
- **`@content-ops`** → confirm folder placement + frontmatter/tag
  compliance for #74, #75, #76 against `docs/content-taxonomy.md`; not in
  scope for this triage PR

## Handoff to `cron/git-auto.md`

The next `cron/git-auto.md` run will:

1. Load `.automation/issues.json` (local-only; never staged).
2. Pick the lowest-numbered open issue in the filtered set that is **not**
   `in_progress` and has **no** open PR — per this triage that is **#76**.
3. `git fetch origin && git checkout -B auto/issue-76 origin/main`.
4. Implement per the #76 spec above, delegating to `@writer` with
   `@diagram` support.
5. Stage files **by explicit path only**; verify `git diff --cached --stat`
   excludes `.automation/` and unrelated paths.
6. Push `auto/issue-76` and open one PR that closes only #76.
7. On the next run, repeat for #77 once #76 has a PR open.

## Skip / Duplicate Guards

Before starting work on each issue the executing run must confirm:

- No open PR on GitHub already references the issue (search `closes #<n>`
  in open PR titles/bodies).
- `.automation/issues.json` does not mark the issue `in_progress` under
  another session.

If either guard trips, skip to the next issue in the ordered list above.
