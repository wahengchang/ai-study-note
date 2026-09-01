---
title: Dispatch 8RhbM — Research/Writing Queue Triage
---

## Context

Audit of the open issue queue on 2026-04-16, filtered to research and writing
tasks, with per-issue agent delegation and operational requirements. This file
initiates the `cron/git-auto.md` workflow for session `8RhbM`.

## Filter

- Scope: `state=OPEN`
- Keep: research, writing, study-note, learn-note
- Drop: bug fixes, layout, infra, tooling (tracked separately)

Excluded from this dispatch: **#67** (layout bug — duplicate H1 rendering) — already covered by PR #68.

## Queue — Research/Writing (5 issues)

| # | Title (short) | Category | Agent(s) | Existing PR | Action |
|---|---|---|---|---|---|
| 77 | Terminal multiplex workflow × Claude Code (cmux) | Research | `@writer` + `@diagram` | #170, #166 | skip — PR-covered |
| 76 | n8n AI YouTube automation workflow | Research | `@writer` + `@diagram` | #154 | skip — PR-covered |
| 75 | raw/wiki LLM knowledge management | Research | `@writer` + `@diagram` | #156 | skip — PR-covered |
| 74 | Astron Agent / Serper / Jina / Python / LLM roles | Writing | `@writer` | #169, #164 | skip — PR-covered |
| 61 | 小紅書 prompt auto-optimizer | Research | `@writer` | #73, #165 | skip — PR-covered |

Per `cron/git-auto.md` §4: *"If issue already has an open PR, skip it."* — this
run produces no new `auto/issue-<n>` branches.

## Operational Requirements

### #77 — terminal multiplex × Claude Code
- **Primary agent**: `@writer` (Research note, Architect objective)
- **Support agent**: `@diagram` — one `flowchart LR` of the 4-pane workflow
- **Source validation**: confirm the XHS link's actual tool (is it `cmux`, `tmux`, `zellij`, `wezterm mux`?)
- **Deliverables**: study note + tool-comparison table (≥3 tools) + 1 minimal workflow recipe
- **Risks**: original source may be mislabeled; clarify identity before synthesizing claims
- **Target path**: `content/claude-notes/terminal-multiplex-claude-code.md`
- **Active PR**: #170

### #76 — n8n AI YouTube automation
- **Primary agent**: `@writer` (Research note, Deploy objective)
- **Support agent**: `@diagram` — `flowchart LR` of end-to-end pipeline (topic → script → visual → audio → render → publish)
- **Scope guardrail**: do NOT attempt PoC implementation; document workflow + tool inventory + cost/risk notes only
- **Deliverables**: workflow breakdown, tool matrix by stage, PoC architecture sketch, policy/copyright risk callouts
- **Risks**: YouTube TOS, copyright, content-farm policy; flag with `> [!warning]`
- **Target path**: `content/ai-workflow/n8n-youtube-automation.md`
- **Active PR**: #154

### #75 — raw/wiki LLM knowledge management
- **Primary agent**: `@writer` (Research note, Architect objective)
- **Support agent**: `@diagram` — `flowchart LR` showing `raw → AI synthesis → wiki → query → write-back`
- **Sources**: user-supplied transcript + Karpathy reference + 林穎俊 reference
- **Deliverables**: outline/draft clarifying raw vs wiki layer separation, write-back loop, IDE + Obsidian + Markdown + Git stack
- **Out-of-scope**: production architecture, broad KM tool comparison
- **Target path**: `content/ai-workflow/raw-wiki-llm-knowledge.md`
- **Active PR**: #156

### #74 — AI workflow parts (Astron / Serper / Jina / Python / LLM)
- **Primary agent**: `@writer` (Study note, Architect objective — lean explainer)
- **Support agent**: none (no diagram required unless clarity demands one)
- **Audience**: non-technical reader; keep a plain-language layer
- **Deliverables**: one-sentence positioning per tool, pricing-tier mention, official links, closing paragraph: "workflow parts, not interchangeable AI tools"
- **Target path**: `content/ai-workflow/astron-serper-jina-python-llm.md`
- **Active PR**: #169

### #61 — 小紅書 prompt auto-optimizer
- **Primary agent**: `@writer` (Research brief)
- **Support agent**: none
- **Source validation**: identify the actual open-source repo referenced in XHS post
- **Deliverables**: project name + repo + TL;DR (3–5 lines) + core-features list + ≥3 reusable takeaways + fit-for-ai-study-note verdict
- **Risks**: source identity ambiguity
- **Target path**: `content/prompt-notes/prompt-auto-optimizer-research.md`
- **Active PR**: #73

## Queue Health

- 5/5 research-writing issues are PR-covered; no new execution branches this run.
- **Cleanup candidate**: triage meta-PRs #162, #163, #167, #168, #171–#182 have accumulated across prior cron runs. Recommend consolidating or closing as stale in a follow-up housekeeping issue rather than opening another one here.
- **Next pickup on git-auto**: nothing — queue is saturated until upstream issues close or new ones open.

## Outcome

- This file is a dispatch record. No execution branches were opened this run.
- Agent assignments above are the source of truth for the open PRs to continue
  against during reviews.
