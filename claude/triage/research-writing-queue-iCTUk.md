---
title: Research & Writing Queue Triage (iCTUk)
---

## Purpose

Audit of the open issue queue for `wahengchang/ai-study-note`, filtered to
**research** and **writing** tasks. Each issue is mapped to an operational
spec and delegated to the agent whose skill set matches the work. This
document initiates the execution workflow defined in
[`cron/git-auto.md`](../../cron/git-auto.md): one issue per run,
lowest-number-first, one branch per issue, one PR per branch.

## Filter

**In scope** — issues whose deliverable is a Markdown note under `content/`:

- #61, #74, #75, #76, #77

**Out of scope** — not research/writing:

- **#63** Adopt Mintlify framework — site-architecture / migration proposal,
  not content authoring. Needs a framework-evaluation task, not `@writer`.
- **#67** Fix duplicate article titles — layout/template bug. Belongs to
  `@content-ops` + Quartz config work, not content authoring.

## Execution Order (lowest-number first, per `cron/git-auto.md`)

| # | Issue | Title (short) | Primary Agent | Support |
|---|-------|---------------|---------------|---------|
| 1 | #61 | Xiaohongshu open-source prompt optimizer | `@writer` | `@reviewer` |
| 2 | #74 | Astron Agent / Serper / Jina / Python / LLM workflow note | `@writer` | `@reviewer`, `@content-ops` (placement) |
| 3 | #75 | Raw/Wiki LLM knowledge management workflow | `@writer` | `@reviewer` |
| 4 | #76 | n8n AI YouTube automation workflow research | `@writer` | `@diagram` (workflow LR), `@reviewer` |
| 5 | #77 | cmux / terminal multiplexing for Claude Code | `@writer` | `@reviewer` |

## Per-Issue Operational Spec

### #61 — Xiaohongshu: open-source prompt optimizer

- **Agent**: `@writer` (classification: *Architect* — tool survey)
- **Required inputs**: original Xiaohongshu URL, candidate repo identification
- **Deliverable**: `content/prompt-notes/<kebab-case>.md`
- **Sections**: Context, Key Findings (TL;DR + repo + 3 reusable points),
  Steps (setup + representative prompt-optimization run), Applicability verdict
- **Acceptance (from issue)**: confirmed upstream project, 3+ reusable points,
  recommendation on ai-study-note inclusion

### #74 — Astron Agent / Serper / Jina / Python node / LLM

- **Agent**: `@writer` (classification: *Architect* — workflow-parts breakdown)
- **Required inputs**: user's Telegram-group draft (already provided in issue)
- **Deliverable**: Markdown note — path to be confirmed by `@content-ops`
  against `docs/content-taxonomy.md`; likely `content/prompt-notes/` or a
  dedicated `content/ai-workflow/` per taxonomy decision tree
- **Sections**: Context, Key Findings (per-tool one-liner + role + pricing),
  Comparison table (tool × category × free-tier × official link),
  "Not one AI, but workflow parts" summary
- **Acceptance (from issue)**: title, publishable outline/draft, unambiguous
  pricing/role per tool, explicit framing as workflow parts

### #75 — Raw/Wiki LLM knowledge management

- **Agent**: `@writer` (classification: *Architect* — system design)
- **Required inputs**: user Facebook share + Chinese narrative already in issue;
  cross-reference existing Karpathy note (merged via PR #69)
- **Deliverable**: Markdown note under `content/claude-code/` or taxonomy-confirmed folder
- **Sections**: Context, Core design (raw vs. wiki layer), Flow (ingest →
  organize → query → write-back), Why it suits personal KM, Minimal IDE +
  Obsidian + Markdown + Git implementation path
- **Acceptance (from issue)**: explicit topic + outline, raw/wiki value
  articulated, extensible to future query/idea-generation usage

### #76 — n8n AI YouTube automation workflow

- **Agent**: `@writer` primary, `@diagram` for workflow visualization
- **Required inputs**: source YouTube URL, tool list already enumerated in issue
- **Deliverable**: research note + tool-category table + PoC architecture sketch
- **Diagram**: Mermaid `flowchart LR` — topic → script → visual → audio →
  assembly → publish → log; 4–6 primary nodes, orange/brand accents per
  project style
- **Sections**: Context, Workflow breakdown, Tool inventory (orchestration /
  LLM / visual / audio / render / publish / storage), PoC (MVP),
  Risk notes (content quality, copyright, YouTube policy, duplicate-content)
- **Acceptance (from issue)**: full workflow + per-tool category rationale,
  1 PoC plan, explicit risk section

### #77 — cmux / terminal multiplexing for Claude Code

- **Agent**: `@writer` (classification: *Architect* — tool comparison)
- **Required inputs**: original Xiaohongshu post confirmation, real project
  identity behind `cmux` reference
- **Deliverable**: Markdown note under `content/claude-code/`
- **Sections**: Context, Tool identification, Comparison table (cmux, tmux,
  zellij, WezTerm mux, others), Why multiplexing helps Claude Code
  (pane-per-role pattern), Minimum viable workflow, Limitations
- **Acceptance (from issue)**: identified upstream tool, 3+ comparable tools,
  1 actionable Claude Code workflow, explicit limits

## Delegation Summary by Agent

- **`@writer`** → #61, #74, #75, #76, #77 (all primary authorship)
- **`@diagram`** → #76 (workflow mermaid, `direction LR`)
- **`@reviewer`** → post-draft audit on every note (BLOCK / WARN / INFO) before
  the note PR is marked ready
- **`@content-ops`** → confirm folder placement + frontmatter/tag compliance
  for #74 and #75 against `docs/content-taxonomy.md` (closed vocabulary only);
  out-of-scope for triage PR itself

## Handoff to `cron/git-auto.md`

The next `cron/git-auto.md` run will:

1. Load `.automation/issues.json` (local-only; never staged).
2. Pick the lowest-numbered open issue in the filtered set that is **not**
   `in_progress` and **has no open PR** already.
3. `git fetch origin && git checkout -B auto/issue-<n> origin/main`.
4. Implement per this triage's per-issue spec.
5. Stage files **by explicit path only**; verify `git diff --cached --stat`
   excludes `.automation/` and unrelated paths.
6. Push `auto/issue-<n>` and open one PR that closes that one issue.

## Skip / Duplicate Guards

Before starting work on each issue, the next run must confirm:

- No open PR on GitHub already closes the issue (search `closes #<n>` in open
  PR titles/bodies — existing open PRs include at minimum `auto/issue-74`
  (#121) and a PR on `claude/gracious-hawking-u3PI2` (#120) for #75).
- Tracker (`.automation/issues.json`) does not mark the issue `in_progress`
  under another session.

If either guard fails, skip to the next issue in the ordered list above.
