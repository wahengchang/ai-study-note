---
title: Cron Dispatch Manifest — Research & Writing Queue
---

## Purpose

Audit the open issue queue, filter for research and writing tasks, map each
issue to the appropriate agent in `claude/config.yaml`, and initiate the
execution workflow defined in `cron/git-auto.md`.

Per `cron/git-auto.md`, only **one** issue is actioned per run (lowest number
first, skipping any issue that already has an open PR).

## Issue Queue Snapshot (2026-04-14)

| Issue | Title | Category | Agent Path | Needs Diagram | Open PR | Status |
|-------|-------|----------|------------|---------------|---------|--------|
| #61 | Xiaohongshu open-source prompt-optimizer research | Research | `@content-ops` → `@writer` → `@reviewer` | No | — | ready (this run) |
| #63 | Adopt Mintlify framework evaluation | Research / Evaluation | `@writer` → `@reviewer` | No | #124 | pr_open — skip |
| #67 | Fix duplicate article titles | Layout / content-convention | — (not research/writing) | No | — | excluded from this queue |
| #74 | Astron Agent / Serper / Jina AI / Python node / LLM study note | Writing | `@writer` → `@diagram` → `@reviewer` | Yes (workflow components) | — | queued |
| #75 | Raw/wiki LLM knowledge management research | Research + Writing | `@writer` → `@diagram` → `@reviewer` | Yes (raw ↔ wiki loop) | — | queued |
| #76 | n8n AI YouTube automation workflow research | Research | `@writer` → `@diagram` → `@reviewer` | Yes (multi-stage pipeline) | — | queued |
| #77 | cmux / terminal multiplexing for Claude Code productivity | Research | `@content-ops` → `@writer` → `@reviewer` | Optional (pane layout) | — | queued |

## Operational Requirements — per Issue

### #61 — Xiaohongshu prompt-optimizer open-source project

- **Primary skill**: source sleuthing (Xiaohongshu link resolution) + technical write-up.
- **Agent chain**: `@content-ops` creates the destination note scaffold under
  `content/prompt-notes/` with frontmatter, then `@writer` authors the research
  note, `@reviewer` audits for accuracy and style.
- **Deliverable**: one research note covering project identity, TL;DR,
  core features, applicable scenarios, and a verdict on inclusion value.
- **Acceptance**: identifies the actual repo/project, ≥3 reusable takeaways,
  explicit inclusion verdict.

### #63 — Mintlify framework adoption

- **Primary skill**: framework evaluation write-up (Mintlify vs Quartz).
- **Agent chain**: `@writer` → `@reviewer`.
- **Status**: covered by open PR #124. Skip this run.

### #74 — Astron Agent / Serper / Jina AI / Python node / LLM

- **Primary skill**: taxonomy + pricing write-up across workflow components.
- **Agent chain**: `@writer` composes the study note, `@diagram` adds an LR
  Mermaid graph showing how the five components fit into one workflow,
  `@reviewer` audits.
- **Deliverable**: one study note under `content/` with clear role/pricing
  table per tool and a workflow diagram.
- **Acceptance**: each tool's role and cost model is unambiguous; diagram
  shows component boundaries rather than a single AI tool.

### #75 — Raw/wiki LLM knowledge management

- **Primary skill**: conceptual synthesis (Karpathy + Lin Ying-Chun references)
  + personal knowledge-management design write-up.
- **Agent chain**: `@writer` + `@diagram` (raw → AI integration → wiki loop),
  `@reviewer`.
- **Deliverable**: learn note outline/draft explaining the raw/wiki split,
  the IDE + Obsidian + Markdown + Git substrate, and the query-to-wiki
  feedback loop.
- **Acceptance**: clear thesis, raw/wiki separation value explained,
  extensible outline.

### #76 — n8n AI YouTube automation workflow

- **Primary skill**: end-to-end pipeline decomposition + tool taxonomy.
- **Agent chain**: `@writer` + `@diagram` (multi-stage pipeline in LR),
  `@reviewer`.
- **Deliverable**: research note with workflow breakdown, categorized tool
  inventory (orchestration / LLM / visual / audio / rendering / publishing /
  storage), and ≥1 minimum-viable PoC proposal.
- **Acceptance**: tool categories fully populated, PoC is actionable, risks
  flagged (quality, copyright, duplicate content, YouTube policy).

### #77 — cmux / terminal multiplexing for Claude Code

- **Primary skill**: source verification (Xiaohongshu link) + comparative
  tooling survey.
- **Agent chain**: `@content-ops` scaffolds under `content/claude-code/`,
  `@writer` authors, `@reviewer` audits.
- **Deliverable**: research note with tool identity resolution, ≥3 comparable
  tools (tmux / zellij / WezTerm mux / cmux), and one minimum workflow for
  Claude Code pane orchestration.
- **Acceptance**: original tool identity confirmed, ≥3 tool comparisons,
  ≥1 practical workflow, limits explicitly stated.

## This Run — Target Selection

Following the rule "pick one open issue, lowest number first, skip if an open
PR exists":

- #61 — **selected** (no open PR).

`cron/git-auto.md` invariants to honour in the execution branch:

1. Branch fresh from `origin/main`: `git checkout -B auto/issue-61 origin/main`.
2. One issue per branch, one PR per branch.
3. Stage files by explicit path only — never `git add .` / `-A`.
4. `.automation/` must not be staged or committed.
5. Working tree must be clean before and after.

## Not in Scope

- #67 (duplicate-title layout bug) is **excluded** — it is a content-convention
  and layout fix, not a research or writing task. Route to a separate
  layout/bug workflow.
- Issues already covered by an open PR (currently #63 via #124) are skipped
  this run to prevent duplicate work.
