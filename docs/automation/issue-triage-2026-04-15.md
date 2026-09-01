---
title: Issue Triage — 2026-04-15 (Research & Writing Queue)
---

## Context

Initiates the [`cron/git-auto.md`](../../cron/git-auto.md) execution loop by auditing the open issue queue, filtering to research and writing scope, recording operational requirements per issue, and mapping each to a primary agent from [`claude/config.yaml`](../../claude/config.yaml).

Snapshot taken: 2026-04-15. Source: `wahengchang/ai-study-note` open issues.

## Filter Rule

- **IN scope**: issues whose deliverable is a note under `content/` — research notes, study notes, learn notes, tooling write-ups.
- **OUT of scope**: UI/layout bugs, build fixes, infrastructure changes (those follow a different agent lane).

## Filtered Queue

| # | Title (short) | Class | Language | Primary Source |
|---|---------------|-------|----------|----------------|
| #61 | Open-source prompt optimizer (Xiaohongshu) | Research | zh-TW | `xhslink.com/o/7iAalKtM6SX` |
| #74 | Astron Agent / Serper / Jina AI / Python node / LLM | Writing | zh-TW | Telegram transcript |
| #75 | LLM-based knowledge management (raw/wiki) | Research + Writing | zh-TW | Facebook share + user transcript |
| #76 | n8n AI YouTube automation workflow | Research + Writing | zh-TW | YouTube `5Htbfh_LYSE` |
| #77 | Terminal multiplexing × Claude Code (`cmux`) | Research | zh-TW | `xhslink.com/o/AAbGLpO7BY4` |

**Excluded**: #67 — duplicate-H1 layout bug. Belongs to the `@content-ops` / UI lane, not the research/writing pipeline.

## Operational Requirements

### #61 — Prompt-optimizer research
- **Inputs**: Xiaohongshu short-link (login-walled). Target project unnamed.
- **Operations**: Source identification → repo/README read → TL;DR → applicability assessment.
- **Risks**: Source unverifiable without login. Candidate for `clarification_needed` flag per `cron/git-auto.md` §4.
- **Target path**: `content/prompt-notes/<kebab-slug>.md`.
- **Size**: S (1 note, ≤ 200 lines).

### #74 — AI workflow components study note
- **Inputs**: User-supplied positioning + pricing blurbs for 5 components (Astron Agent, Serper.dev, Jina AI, Python node, LLM).
- **Operations**: Verify official URLs → per-component role/pricing table → workflow-parts framing paragraph.
- **Risks**: Pricing drift. Audience is non-technical — keep one plain-language pass.
- **Target path**: `content/claude-code/tools-and-skills/<kebab-slug>.md` (sibling to existing tooling notes).
- **Size**: S.

### #75 — Raw/wiki LLM knowledge management
- **Inputs**: User transcript + references (Karpathy, 林穎俊).
- **Operations**: Two-layer design writeup (raw ↔ wiki) → workflow diagram (optional LR flowchart) → low-barrier implementation notes (IDE + Obsidian + Markdown + Git).
- **Risks**: Overlap with any prior `karpathy-llm-wiki-pattern` note — check before authoring.
- **Target path**: `content/claude-code/` or `content/prompt-notes/` (confirm via `docs/content-taxonomy.md`).
- **Size**: M.

### #76 — n8n YouTube automation research
- **Inputs**: Full workflow spec + tool taxonomy (orchestration / LLM / visual / audio / render / publish / storage).
- **Operations**: End-to-end workflow decomposition → per-category tool table → PoC architecture sketch → risk section (copyright, YouTube policy, cost).
- **Risks**: Pricing across 10+ SaaS drifts quickly — add "verified on <date>" footnote.
- **Target path**: `content/claude-code/` or `content/automation/` (confirm via taxonomy).
- **Size**: L. Diagram clearly adds value here.

### #77 — Terminal multiplexing × Claude Code
- **Inputs**: Xiaohongshu short-link + `cmux` keyword. Compare with `tmux`, `zellij`, WezTerm mux.
- **Operations**: Identify the actual project behind `cmux` → comparison table → Claude Code pane layout recommendation (agent / logs / edit-git-test / monitor).
- **Risks**: `cmux` is ambiguous (multiple projects use the name) — verify source before authoring.
- **Target path**: `content/claude-code/tools-and-skills/<kebab-slug>.md`.
- **Size**: M.

## Agent Delegation

| # | Primary | Supporting | Rationale |
|---|---------|------------|-----------|
| #61 | `@writer` | `@reviewer` | Research → note. No diagram. |
| #74 | `@writer` | `@reviewer` | Comparative tooling note; reviewer enforces terminology. |
| #75 | `@writer` | `@diagram`, `@reviewer` | Two-layer design benefits from one LR flowchart. |
| #76 | `@writer` | `@diagram`, `@reviewer` | Workflow decomposition → LR diagram mandatory. |
| #77 | `@writer` | `@diagram` (optional), `@reviewer` | Comparison table primary; diagram only if pane layout needs it. |

`@content-ops` is held in reserve — invoke post-authoring if the taxonomy placement is ambiguous or if `index.md` regeneration is required.

## Execution Order

Per `cron/git-auto.md` §4 ("one issue per run, lowest number first"):

1. **#61** → `auto/issue-61` branched fresh from `origin/main`.
2. **#74** → `auto/issue-74`.
3. **#75** → `auto/issue-75`.
4. **#76** → `auto/issue-76`.
5. **#77** → `auto/issue-77`.

Each run: fresh branch from `origin/main`, one issue per branch, one branch per PR, `.automation/` state stays local.

## Pre-run Notes

- Several of these issues already have open PRs from earlier cron ticks; the loop must honor its "skip if PR already open" rule.
- #74 and #77 have been observed to attract duplicate PRs — the cron should reconcile (keep one, close the other) before opening new work.
- This document is the snapshot that the next cron tick reads before picking the first unclaimed issue.
