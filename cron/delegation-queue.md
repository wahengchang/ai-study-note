---
title: Research & Writing Delegation Queue
---

> Generated dispatch manifest that feeds the `./cron/git-auto.md` execution workflow.
> Filter scope: open issues whose deliverable is a research note or study note.
> Execution order: lowest issue number first, one issue per run, one branch per PR.

## Audit Summary

| Metric | Value |
|---|---|
| Open issues scanned | 7 |
| Research / writing matches | 5 |
| Out of scope (infra / bugfix) | 2 |
| Already covered by an open execution PR | 3 |
| Awaiting execution (queue depth) | 2 |
| Generated on branch | `claude/gracious-hawking-3vszM` |
| Generated at | 2026-04-13 |

### Out of scope (not research / writing)

- **#67** — Duplicate article titles on pages. Layout / template bug; route through a front-end fix, not `@writer`.
- **#63** — Adopt Mintlify framework. Infrastructure migration evaluation; already covered by execution PR **#124** and routed to an architecture lane.

### Already covered by an existing execution PR (skip per `git-auto.md` §4)

| Issue | Execution PR | Note |
|---|---|---|
| #61 — 自動優化提示詞 XHS 研究 | #73 | 等待 review / merge |
| #74 — Astron / Serper / Jina / Python / LLM 分工筆記 | #121 (also #103) | 等待 review / merge |
| #75 — LLM-based raw+wiki 知識管理 | #120 | 等待 review / merge |

## Filtered Queue — Execution-Ready

Processing order follows `cron/git-auto.md` §4 ("Pick one open issue per run, lowest number first").
The queue skips any issue that already has an open execution PR. The next run picks **#76**.

### ▶ Next up — Issue #76 — Research AI-powered YouTube automation workflow (n8n)

- **Type:** Research note + tool-catalog
- **Primary agent:** `@writer` (objective = Architect)
- **Secondary agents:** `@diagram` (end-to-end pipeline, `flowchart LR`), `@reviewer`, `@content-ops`
- **Operational requirements:**
  - Decompose pipeline into 7 stages: ideation → script → visuals → audio → assembly → publish → telemetry.
  - Build a categorized tool table (Orchestration / LLM / Visual / Audio / Render / Publish / Storage) with purpose, strengths, limits.
  - Surface a minimum viable PoC architecture with cost + dependency notes.
  - Call out risks explicitly: content quality, copyright, duplicate content, YouTube policy.
  - Confirm whether the workflow transfers to zh-TW content production.
- **Deliverable path:** `content/ai-workflow/youtube-automation-n8n-pipeline.md`
- **Definition of done:** pipeline diagram (LR), tool matrix, PoC sketch, explicit risks section, `npm run quartz -- build` exits 0.

### Issue #77 — Research terminal multiplexing workflow for Claude Code (cmux)

- **Type:** Research note + tool comparison
- **Primary agent:** `@writer` (objective = Optimize)
- **Secondary agents:** `@diagram` (pane / session topology, LR), `@reviewer`, `@content-ops`
- **Operational requirements:**
  - Resolve whether the XHS post's `cmux` refers to the common term multiplexer or a specific project; document both and cite the source link.
  - Comparison table across ≥3 candidates: `cmux`, `tmux`, `zellij`, WezTerm workspace / mux.
  - Propose ≥1 minimum-viable multi-pane workflow for Claude Code (agent pane / log pane / git-edit pane / long-running monitor pane).
  - Constraints section: remote sessions, IDE integration, state loss on detach.
- **Deliverable path:** `content/claude-code/terminal-multiplexing-workflow.md`
- **Definition of done:** tool identity confirmed, ≥3 tools compared, ≥1 workflow proposed with documented limits.

## Cross-Reference — Issues Already in Flight

These entries stay in the manifest for traceability. Do not open a second PR per `git-auto.md` §4.

### Issue #61 — 小紅書「自動優化專業級提示詞」研究 → PR #73

- **Primary agent:** `@writer` (objective = Architect)
- **Secondary agents:** `@reviewer`, `@content-ops`
- **Operational requirements:** resolve the XHS target project, produce 3–5 line TL;DR, core features, ≥3 reusable takeaways, fit-for-repo verdict, cite repo URL + license, flag unverifiable assumptions with `> [!warning]`.

### Issue #74 — Astron Agent / Serper / Jina / Python node / LLM 分工 → PR #121

- **Primary agent:** `@writer` (objective = Architect)
- **Secondary agents:** `@diagram`, `@reviewer`, `@content-ops`
- **Operational requirements:** frame the five items as distinct workflow roles (model / tool / platform / code node / LLM), 5-row role × pricing × link table, optional LR flow, plain-language summary.

### Issue #75 — LLM-based knowledge management (raw + wiki) → PR #120

- **Primary agent:** `@writer` (objective = Architect)
- **Secondary agents:** `@diagram`, `@reviewer`
- **Operational requirements:** keep raw (append-only) vs wiki (continuously refactored) explicit, document ingest → summarize → wiki → cross-reference → write-back loop, anchor to Karpathy and 林穎俊 prior art, stay on IDE + Obsidian + Markdown + Git stack.

## Agent Skillset Map

| Agent | Primary responsibility | Used in issues |
|---|---|---|
| `@writer` | Lean Quartz notes, evidence-based, objective-driven | #61, #74, #75, #76, #77 |
| `@reviewer` | Accuracy + style + completeness QA | #61, #74, #75, #76, #77 |
| `@diagram` | Mermaid `LR` flows where visualization earns its keep | #74, #75, #76, #77 |
| `@content-ops` | Taxonomy placement, frontmatter, index regen | #61, #74, #76, #77 |

## Execution Handoff

Per `cron/git-auto.md`:

1. Load `.automation/issues.json` (local state only — never stage or commit it).
2. Consume this queue top-down; the next run starts with **#76**, then **#77**.
3. For each picked issue: `git fetch origin && git checkout -B auto/issue-<n> origin/main`.
4. Apply the assigned agent(s), commit by explicit path only, push, open one PR.
5. Record status transitions (`in_progress` → `pr_open` | `failed` | `blocked` | `done`) in the tracker only.

> This PR does not execute the queue — it ratifies the delegation plan that the automation loop will process on its next cycles.
