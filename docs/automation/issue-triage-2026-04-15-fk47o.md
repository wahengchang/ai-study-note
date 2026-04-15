---
title: Issue Triage — Research & Writing Queue (2026-04-15)
description: Filtered open-issue audit that delegates each research/writing task to the right agent from claude/config.yaml, seeding the cron/git-auto.md execution workflow.
tags:
  - ops
  - automation
---

## Purpose

Initiate the execution workflow described in [`cron/git-auto.md`](../../cron/git-auto.md) by:

1. Auditing the open issue queue
2. Filtering to **research** and **writing** tasks only
3. Capturing operational requirements per issue
4. Delegating each to the appropriate agent from [`claude/config.yaml`](../../claude/config.yaml)

## Filter boundary

| Included | Excluded |
|---|---|
| Issues labeled `documentation` / `enhancement` whose deliverable is a study note, research note, or workflow write-up | Layout/site/theme bugs, build errors, tooling changes, refactors |

### Open issues scanned

| # | Title | Classification | In scope? |
|---|---|---|---|
| 77 | Research terminal multiplexing workflow (`cmux`) × Claude Code | Research | Yes |
| 76 | Research AI-powered YouTube automation (n8n) | Research + Writing | Yes |
| 75 | Research learn note — LLM-based knowledge management (raw/wiki) | Research + Writing | Yes |
| 74 | Write study note on Astron Agent, Serper, Jina AI, Python node, LLM | Writing | Yes |
| 67 | Fix duplicate article titles on ai-study-note pages | Layout/theme bug | **No** (UI fix lane) |
| 61 | (Research) 小紅書：自動優化專業級提示詞開源項目 | Research | Yes (blocked on clarification) |

## Per-issue operational brief

### #61 — 小紅書 prompt-optimizer open-source project

| Field | Value |
|---|---|
| Class | Research |
| Primary agent | `@writer` |
| Supporting | `@reviewer` |
| State | `clarification_needed` (see issue comment from cron run) |
| Blocker | Xiaohongshu short-link 302 → client-side rendered, login-gated page. Cannot reach the post text without user-supplied repo name or screenshot. |
| Operational requirement | **Do not branch/start** until user supplies the referenced repo or post content. Candidates shortlisted (`linshenkx/prompt-optimizer`, `microsoft/PromptWizard`, `stanfordnlp/dspy`, `zou-group/textgrad`, `vaibkumr/prompt-optimizer`) — picking without evidence risks fabrication. |
| Output path (when unblocked) | `content/tool-notes/<repo-slug>-prompt-optimizer.md` |
| DoD mapping | TL;DR (3–5 lines) · core features · applied scenarios · ≥3 reusable takeaways · inclusion verdict |

### #74 — Astron Agent / Serper / Jina AI / Python node / LLM workflow parts

| Field | Value |
|---|---|
| Class | Writing (source material already collated by user in Telegram) |
| Primary agent | `@writer` |
| Supporting | `@diagram` (one LR flowchart showing workflow role of each part), `@reviewer` |
| State | Ready to execute |
| Operational requirement | Use `@writer` output schema: `Context → Key Findings → Steps / Implementation`. Non-technical pass preserved alongside technical one. Include a table of `component → role → free tier → link`. Explicit callout that these are **workflow parts, not substitutable AI tools**. |
| Output path | `content/tool-notes/ai-workflow-parts-astron-serper-jina.md` |
| DoD mapping | Clear title · publishable outline/draft · no role/pricing ambiguity · parts-not-tools framing explicit |

### #75 — LLM-based knowledge management (raw/wiki)

| Field | Value |
|---|---|
| Class | Research + Writing |
| Primary agent | `@writer` |
| Supporting | `@diagram` (state/flow: raw → wiki → query → feedback), `@reviewer` |
| State | Ready to execute |
| Operational requirement | Dual-layer design (`raw` immutable, `wiki` evolving) is the thesis. Reference Karpathy and 林穎俊 approaches but anchor in the user's simplified variant. Concrete stack note: IDE + Obsidian + Markdown + Git. Mermaid LR for the feedback loop (query → new insight → wiki writeback). |
| Output path | `content/study-notes/llm-raw-wiki-knowledge-management.md` |
| DoD mapping | Clear title/outline · workflow core design called out · raw/wiki separation value articulated · extensible into public notes |

### #76 — n8n AI YouTube automation workflow

| Field | Value |
|---|---|
| Class | Research + Writing |
| Primary agent | `@writer` |
| Supporting | `@diagram` (LR flowchart of the 7-stage pipeline), `@reviewer` |
| State | Ready to execute |
| Operational requirement | Break the video pipeline into: ideation → script → visuals → audio → assembly → publish → logging/notify. One row per stage in a tool table with **role · options · free tier · risk**. Explicit risk section on YouTube policy, duplicate-content, copyright. Call out **what is truly no-code vs. what needs engineering glue**. PoC stack = minimum viable subset. |
| Output path | `content/workflow-notes/n8n-youtube-auto-pipeline.md` |
| DoD mapping | Full workflow + tool taxonomy · per-category use/advantage/limit · ≥1 PoC · risks labeled |

### #77 — `cmux` / terminal multiplexing × Claude Code

| Field | Value |
|---|---|
| Class | Research |
| Primary agent | `@writer` |
| Supporting | `@diagram` (optional: LR pane layout), `@reviewer` |
| State | Ready to execute — verify `cmux` identity first |
| Operational requirement | Step 1 disambiguate the `cmux` project referenced (multiple tools share the name). Step 2 compare against `tmux`, `zellij`, `WezTerm mux`, `screen`. Step 3 propose one minimum pane workflow: agent pane · logs pane · edit/git/test pane · long-task monitor pane. If source post remains inaccessible, note the assumption explicitly with `> [!warning]`. |
| Output path | `content/workflow-notes/terminal-multiplexing-claude-code.md` |
| DoD mapping | Source identity confirmed · ≥3 comparable tools/workflows · ≥1 Claude Code workflow · scope & limits stated |

## Agent-assignment summary

| # | Primary | Supporting | Rationale |
|---|---|---|---|
| 61 | `@writer` | `@reviewer` | Research → study note. Blocked until source confirmed. |
| 74 | `@writer` | `@diagram`, `@reviewer` | Source already prose; needs role/pricing table + workflow diagram. |
| 75 | `@writer` | `@diagram`, `@reviewer` | Conceptual flow benefits from one LR diagram of the raw → wiki → query loop. |
| 76 | `@writer` | `@diagram`, `@reviewer` | Pipeline-heavy; a 6–7 node LR flowchart is the fastest readable summary. |
| 77 | `@writer` | `@diagram` (opt), `@reviewer` | Comparison note; diagram optional if pane layout clarifies. |

`@content-ops` is held in reserve — only invoked if placement is ambiguous against `docs/content-taxonomy.md` or affected folders need `index.md` regeneration after authoring.

## Execution contract (per `cron/git-auto.md`)

- One issue per cron tick, lowest open number first: **61 → 74 → 75 → 76 → 77**.
- Skip #61 at the top of the loop while it is `clarification_needed`; pick #74 as the first actionable item.
- Skip any issue that already has an open `auto/issue-<n>` PR (e.g. the pre-existing `auto/issue-61`, `auto/issue-74`, `auto/issue-77` branches are already tracked — cron rebases or leaves them alone rather than opening duplicates).
- Branch recipe per run: `git fetch origin && git checkout -B auto/issue-<n> origin/main`.
- One branch → one PR → one issue. No bundling.
- `.automation/` stays local-only; explicit-path staging only.

## Acceptance for this triage artifact

- [ ] Every in-scope open research/writing issue appears in the per-issue briefs.
- [ ] Each brief names one primary agent from `claude/config.yaml`.
- [ ] Each brief maps requirements back to the issue's Definition of Done.
- [ ] `#67` is explicitly excluded with a reason.
- [ ] Execution order matches `cron/git-auto.md` §4 (lowest number first, skip `in_progress` / open-PR issues).
