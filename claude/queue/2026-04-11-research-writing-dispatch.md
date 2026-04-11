---
title: "Research & Writing Queue Dispatch — 2026-04-11"
description: "Audit of the open issue queue, filtered to research and writing tasks, with per-issue agent delegation to initiate cron/git-auto.md execution."
tags:
  - dispatch
  - queue
  - ops
---

## Purpose

Entry point for the next `cron/git-auto.md` execution cycle. Audits the open
issue queue, filters to research / writing work, records the operational
requirements per issue, and assigns each to a registered agent in
`claude/config.yaml`. Merging this dispatch initiates the downstream workflow:
git-auto picks one issue per run (lowest number first), branches off fresh
`origin/main`, and opens one PR per issue.

## Audit — open issue queue

Snapshot taken 2026-04-11. Source: `mcp__github__list_issues --state OPEN`.

| #   | Title                                            | Type               | Has open PR                    | Verdict                                     |
| --- | ------------------------------------------------ | ------------------ | ------------------------------ | ------------------------------------------- |
| #61 | 小紅書 OSS prompt optimizer                      | Research           | Yes — PR #73 (`auto/issue-61`) | **Skip** — already in flight                |
| #63 | Adopt Mintlify as docs framework                 | Framework eval     | Branch `auto/issue-63` exists  | **Exclude** — engineering spike, not a note |
| #67 | Fix duplicate article titles                     | Layout bug         | Yes — PR #68 (`auto/issue-67`) | **Exclude** — not research/writing          |
| #74 | Astron Agent / Serper / Jina / Python / LLM note | Writing            | No                             | **Include**                                 |
| #75 | LLM raw/wiki knowledge management                | Research → Writing | No                             | **Include** (extend existing note)          |
| #76 | n8n AI YouTube automation workflow               | Research → Writing | No                             | **Include**                                 |
| #77 | cmux × Claude Code terminal workflow             | Research → Writing | No                             | **Include** (source verification first)     |

Four issues enter the dispatch: **#74, #75, #76, #77**.

## Delegation — per issue

All primary drafting routes to `@writer`. Support agents are engaged only where
the requirement matches their skill set per `claude/config.yaml`.

### #74 — Astron Agent / Serper / Jina / Python node / LLM

- **Primary:** `@writer`
- **Support:** `@reviewer` (pricing and positioning accuracy), `@content-ops` (placement)
- **Type:** Pure writing — source material is pre-collated in the issue
- **Target path (proposed):** `content/claude-code/ai-workflow-component-roles.md`
- **Operational requirements:**
  - One-line positioning per tool (model / tool / platform / logic node)
  - Free tier vs paid — flag "free to start, pay at scale" items
  - Official URLs for each component
  - Workflow-as-parts framing in the summary (explicit: "not one AI tool, different parts of one pipeline")
- **Done when:** Draft renders in Quartz; tool roles distinct and non-overlapping; reviewer sign-off on pricing claims.

### #75 — LLM raw/wiki knowledge management

- **Primary:** `@writer`
- **Support:** `@content-ops` (merge-vs-sibling gate), `@reviewer`
- **Type:** Research note — **must extend** `content/prompt-notes/karpathy-llm-wiki-pattern.md` (shipped in `bc7dd17`, closed #65) rather than create a parallel note
- **Operational requirements:**
  - `@content-ops` decides extend-in-place vs sibling note before drafting starts
  - Capture the user's simplification angle on top of the Karpathy baseline
  - raw / wiki separation — why raw is immutable, how wiki evolves
  - IDE + Obsidian + Markdown + Git stack as the low-floor implementation
  - Write-back loop: query insights → wiki updates
- **Done when:** No duplication of existing karpathy note; extension or sibling decision recorded in commit message.

### #76 — n8n AI YouTube automation workflow

- **Primary:** `@writer`
- **Support:** `@diagram` (pipeline flow, `direction LR`), `@reviewer`
- **Type:** Research note + tool inventory — largest surface area in this batch
- **Target path (proposed):** `content/claude-code/n8n-youtube-automation-research.md`
- **Operational requirements:**
  - End-to-end pipeline decomposition: idea → script → visuals → audio → render → publish → monitor
  - Tool table grouped by pipeline stage (orchestration / LLM / visual / audio / render / publish / storage)
  - Explicit "no-code vs needs integration glue" call per stage
  - Risk section: copyright, content quality, duplicate content, YouTube policy, API cost
  - At least one minimal PoC architecture sketch
- **Done when:** Workflow table complete; mermaid LR diagram renders; at least one PoC scoped.

### #77 — cmux × Claude Code terminal workflow

- **Primary:** `@writer`
- **Support:** `@reviewer`
- **Type:** Research note — **requires source verification before drafting**
- **Operational requirements:**
  - Resolve `cmux` tool identity first — xhslink URLs are short-lived; verify canonical project (GitHub repo, maintainer) before writing
  - If unverifiable, note writer must include `> [!warning]` callout and list candidates rather than fabricate
  - Comparison table: cmux vs tmux vs zellij vs WezTerm workspace/mux
  - Typical multi-pane pattern for Claude Code: agent pane, logs pane, edit/git pane, long-task monitor pane
  - Minimal adoptable workflow at the end
- **Done when:** Tool identity verified or explicitly flagged; at least 3 comparable tools covered; 1 minimum-viable workflow documented.

## Execution order

Shortest-path-to-shipped first, blocking-risk second:

1. **#74** — no blockers, material pre-collated → fastest win
2. **#75** — needs `@content-ops` gate (1 decision), then straightforward
3. **#77** — blocked on source verification; fail-fast if identity unresolvable
4. **#76** — largest surface area; schedule last

## Handover to `cron/git-auto.md`

Per `cron/git-auto.md` invariants, each downstream run will:

- `git fetch origin && git checkout -B auto/issue-<n> origin/main`
- Mark issue `in_progress` in `.automation/issues.json` before starting
- One issue per branch, one branch per PR
- Stage files by explicit path only (never `git add .` or `.automation/...`)
- Validate with `npm run quartz -- build` and `npm run check` before push
- On success mark `pr_open`; on validation failure mark `failed`

## Test plan

- [ ] Reviewer confirms the filter (research/writing only) and the exclusions (#61, #63, #67)
- [ ] `@content-ops` confirms the #75 extend-vs-sibling call before the writer run
- [ ] First git-auto cycle picks up #74 and opens `auto/issue-74`
- [ ] `npm run quartz -- build` exits 0 (dispatch doc lives under `claude/`, no site impact)
