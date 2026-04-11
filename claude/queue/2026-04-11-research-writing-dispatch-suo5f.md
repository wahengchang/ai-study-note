---
title: Research and Writing Dispatch — 2026-04-11 (SUo5F)
description: Audits the open issue queue, filters research and writing tasks, and routes each filtered item to the agent registered in claude/config.yaml. Initiates the next downstream cron/git-auto.md execution cycle on the claude/gracious-hawking-SUo5F branch.
tags:
  - dispatch
  - queue
  - automation
---

## Purpose

Audit the open issue queue on `wahengchang/ai-study-note`, filter research and writing tasks, analyse per-issue operational requirements, delegate each filtered item to the best-fit agent registered in [`claude/config.yaml`](../config.yaml), and initiate the next downstream [`cron/git-auto.md`](../../cron/git-auto.md) execution cycle on the `claude/gracious-hawking-SUo5F` branch.

## Audit — open queue (2026-04-11)

7 open issues total. Verdicts below.

| # | Title | Kind | Verdict | Reason |
|---|---|---|---|---|
| wahengchang/ai-study-note#77 | `cmux` × Claude Code terminal multiplexing | Research → Writing | **Include** | Authoring task, no in-flight branch |
| wahengchang/ai-study-note#76 | n8n AI YouTube automation workflow | Research → Writing | **Include** | Authoring task, no in-flight branch |
| wahengchang/ai-study-note#75 | LLM raw/wiki knowledge management | Research → Writing | **Include** | Authoring task; overlaps shipped `content/prompt-notes/karpathy-llm-wiki-pattern.md` (merged in `bc7dd17`) — extend-vs-sibling decision required |
| wahengchang/ai-study-note#74 | Astron Agent / Serper / Jina / Python node / LLM positioning | Writing | **Include** | Source pre-collated, no in-flight branch |
| wahengchang/ai-study-note#67 | Duplicate H1 titles | Layout bug | **Exclude** | Not research/writing; PR wahengchang/ai-study-note#68 already open on `auto/issue-67` |
| wahengchang/ai-study-note#63 | Adopt Mintlify as new framework | Framework migration spike | **Exclude** | Engineering evaluation, not a content note |
| wahengchang/ai-study-note#61 | 小紅書 OSS prompt optimizer research | Research | **Skip** | PR wahengchang/ai-study-note#73 already open on `auto/issue-61`; respects `cron/git-auto.md` "one issue per branch" invariant |

**In scope after filter:** wahengchang/ai-study-note#74, wahengchang/ai-study-note#75, wahengchang/ai-study-note#76, wahengchang/ai-study-note#77.

## Agent registry (source: `claude/config.yaml`)

| Agent | Skill set |
|---|---|
| `@writer` | Convert experiments and workflows into lean, decision-ready Quartz notes (formatting + mermaid + quartz prompts) |
| `@reviewer` | Audit notes for technical accuracy, style compliance, completeness (formatting + quartz prompts) |
| `@diagram` | Generate or refactor Mermaid diagrams following project standards (`direction LR` only) |
| `@content-ops` | Organize files, fix frontmatter, rename, bulk content maintenance (formatting + quartz prompts) |

`@writer` is the only authoring agent registered. Support agents engage only when their registered skill set is required by an operational gate.

## Per-issue operational analysis and delegation

### wahengchang/ai-study-note#74 — Astron Agent / Serper / Jina / Python node / LLM positioning note

- **Operational requirements:**
  - Source material is pre-collated by the issue author (one-line positioning per tool, pricing concept, links).
  - Audience: non-technical readers; needs a plain-language pass alongside the technical positioning.
  - Critical claim class: pricing tiers and free quota — must reflect the vendor's live pricing page on draft day.
  - Output: title + outline + draft, clearly framing the tools as workflow components rather than competing AI products.
- **Primary:** `@writer`
- **Support:** `@reviewer` (style + accuracy audit), `@content-ops` (placement under `content/` and frontmatter)
- **Blocking gate:** Every pricing claim verified against the vendor's live pricing page at draft time. No stale numbers.
- **Suggested target:** `content/claude-code/tools-and-skills/astron-serper-jina-workflow-roles.md` (final placement subject to `@content-ops`)

### wahengchang/ai-study-note#75 — LLM raw/wiki knowledge management

- **Operational requirements:**
  - Concept overlaps strongly with the shipped note `content/prompt-notes/karpathy-llm-wiki-pattern.md` (merged in `bc7dd17`, closes wahengchang/ai-study-note#65). Risk of duplication or contradictory framing.
  - Must clearly separate the raw layer (immutable source) from the wiki layer (curated, AI-maintained).
  - Should articulate the value of the loop: query → new insight → wiki write-back.
  - Source includes Andrej Karpathy and 林穎俊 老師 references plus the user's own simplified flow.
- **Primary:** `@writer`
- **Support:** `@content-ops` (extend-vs-sibling decision against existing karpathy note), `@reviewer`
- **Blocking gate:** `@content-ops` rules extend-vs-sibling on `content/prompt-notes/karpathy-llm-wiki-pattern.md` **before** `@writer` starts. If extend, the writer modifies that file; if sibling, the writer creates a new file with a "see also" pointer to it.
- **Suggested target:** extend `content/prompt-notes/karpathy-llm-wiki-pattern.md` (default), fallback `content/prompt-notes/llm-raw-wiki-knowledge-loop.md`

### wahengchang/ai-study-note#76 — n8n AI YouTube automation workflow inventory

- **Operational requirements:**
  - End-to-end pipeline with 7 stages and 20+ tools across orchestration, LLM, visual, audio, video render, publishing, storage/logging.
  - Stage-by-stage call on what is genuinely no-code vs what requires integration glue.
  - Cost / API quota structure across stages.
  - Explicit policy and copyright `> [!warning]` callout (YouTube TOS, duplicate-content rules, music licensing).
  - Largest surface area in this dispatch.
- **Primary:** `@writer`
- **Support:** `@diagram` (Mermaid `direction LR` for the pipeline), `@reviewer`
- **Blocking gate:** Stage-by-stage "no-code vs integration glue" split must be explicit — no glossing. Policy/copyright callout must be present, not implied.
- **Suggested target:** `content/claude-code/tools-and-skills/n8n-youtube-automation-workflow.md`

### wahengchang/ai-study-note#77 — `cmux` × Claude Code terminal multiplexing workflow

- **Operational requirements:**
  - Source is a Xiaohongshu post (`xhslink` link); the tool name `cmux` is ambiguous and may not match a canonical project. Fabrication risk is high.
  - Needs a comparison table against `tmux`, `zellij`, WezTerm mux, etc.
  - Must produce at least one actionable Claude Code workflow (panes for agent / logs / edit-test / long-running monitor).
- **Primary:** `@writer`
- **Support:** `@reviewer`
- **Blocking gate:** `cmux` tool identity verified from a primary source, **or** the note opens with a `> [!warning]` callout flagging unverified identity. Never fabricate the tool.
- **Suggested target:** `content/claude-code/tools-and-skills/cmux-claude-code-workflow.md`

## Execution order

Shortest-path-to-shipped first; blocking-risk fail-fast second.

1. **wahengchang/ai-study-note#74** — source pre-collated, no upstream blockers
2. **wahengchang/ai-study-note#75** — `@content-ops` extend-vs-sibling gate, then straightforward
3. **wahengchang/ai-study-note#77** — fail-fast on `cmux` source verification
4. **wahengchang/ai-study-note#76** — largest surface area, schedule last

Each downstream cycle runs under [`cron/git-auto.md`](../../cron/git-auto.md) invariants:

- Branch fresh from `origin/main` as `auto/issue-<n>`
- One issue per branch, one branch per PR
- Explicit-path staging only — never `git add .` / `git add -A`
- `.automation/` is local state and is never staged
- Working tree must be clean before starting a new cycle
- Only one issue per run; lowest-number-first selection within the in-scope set

## Overlap with prior dispatch PRs

Earlier dispatch PRs targeting the same queue on 2026-04-11 — wahengchang/ai-study-note#78, wahengchang/ai-study-note#79, wahengchang/ai-study-note#80, wahengchang/ai-study-note#81, wahengchang/ai-study-note#82, wahengchang/ai-study-note#83, wahengchang/ai-study-note#84, wahengchang/ai-study-note#85, wahengchang/ai-study-note#86, and wahengchang/ai-study-note#87 — all remain open and unmerged. This brief is the canonical dispatch for the `claude/gracious-hawking-SUo5F` execution branch. On merge, the stale dispatch PRs above should be closed to stop conflicting routing instructions reaching the downstream `cron/git-auto.md` runner.
