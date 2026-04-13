---
title: Research & Writing Delegation Queue
---

> Audit artifact that feeds the `./cron/git-auto.md` execution workflow.
> Filter scope: open issues whose deliverable is a **research note** or **study note**.
> Execution order: lowest issue number first, one issue per run, one branch per PR.

## Audit Summary

| Metric | Value |
|---|---|
| Open issues scanned | 7 |
| Research / writing matches | 5 |
| Out of scope (infra / layout) | 2 |
| Generated on branch | `claude/gracious-hawking-lcH3T` |
| Audit date | 2026-04-13 |

### Out of scope (excluded from this queue)

- **#63** — Adopt Mintlify as docs framework. Infrastructure migration / tooling evaluation, not a content deliverable. Route through an architecture review before any writing work.
- **#67** — Duplicate article titles on pages. Layout/template bug plus an authoring-rule tweak; route through front-end + `@content-ops`, not a research writer.

## Filtered Queue

Processing order follows `cron/git-auto.md` §4 ("Pick one open issue per run, lowest number first"). Next pickup: **#61**.

### Issue #61 — Research 小紅書「寶藏開源項目，自動優化專業級提示詞」

- **Type:** Research note (source: XHS short-link)
- **Primary agent:** `@writer` (objective = Architect)
- **Secondary agents:** `@reviewer` (accuracy + style audit), `@content-ops` (taxonomy placement under `content/research/` or `content/prompt-notes/`)
- **Operational requirements:**
  - Resolve `http://xhslink.com/o/7iAalKtM6SX` to confirm the actual open-source project referenced.
  - TL;DR in 3–5 lines; core feature list; ≥3 reusable takeaways; explicit fit-for-repo verdict.
  - Cite canonical repo URL and license; gate any unverified XHS claim behind `> [!warning]`.
- **Deliverable path:** `content/research/prompt-optimizer-xhs-<slug>.md`
- **Definition of done:** all four DoD checkboxes in the issue met; `npm run quartz -- build` exits 0.

### Issue #74 — Write study note on Astron Agent, Serper, Jina AI, Python node, LLM

- **Type:** Study note (user supplied source material)
- **Primary agent:** `@writer` (objective = Architect)
- **Secondary agents:** `@diagram` (workflow role split, `flowchart LR`), `@reviewer`, `@content-ops`
- **Operational requirements:**
  - Treat the five items as distinct workflow roles — model / tool / platform / code node / LLM — not competing AI products.
  - Deliver a 5-row table: role, one-line definition, pricing model, official link.
  - Append a plain-language summary for non-technical readers.
  - Optional Mermaid: LR flowchart illustrating how the roles connect inside a single AI workflow.
- **Deliverable path:** `content/ai-workflow/astron-serper-jina-python-llm-roles.md`
- **Definition of done:** title set; roles disambiguated; pricing accurate; links resolvable; build green.

### Issue #75 — Research learn note on LLM-based knowledge management (raw + wiki)

- **Type:** Research / learn note
- **Primary agent:** `@writer` (objective = Architect)
- **Secondary agents:** `@diagram` (raw→wiki dual-layer flow, LR), `@reviewer`
- **Operational requirements:**
  - Make the raw/wiki separation explicit: raw is append-only; wiki is continuously refactored.
  - Document the loop: ingest raw → LLM summarization → wiki entry → cross-reference → new insight → write back.
  - Anchor prior-art references to Andrej Karpathy and 林穎俊.
  - Emphasize low-friction stack: IDE + Obsidian + Markdown + Git.
- **Deliverable path:** `content/research/llm-knowledge-management-raw-wiki.md`
- **Definition of done:** outline or draft with clear raw-vs-wiki framing and publish-ready tone.

### Issue #76 — Research AI-powered YouTube automation workflow (n8n)

- **Type:** Research note + tool catalog
- **Primary agent:** `@writer` (objective = Architect)
- **Secondary agents:** `@diagram` (end-to-end pipeline, LR), `@reviewer`, `@content-ops`
- **Operational requirements:**
  - Decompose the pipeline into 7 stages: ideation → script → visuals → audio → assembly → publish → telemetry.
  - Categorized tool table (Orchestration / LLM / Visual / Audio / Render / Publish / Storage) with purpose, strengths, limits.
  - Minimum viable PoC architecture sketch.
  - Explicit risks section: content quality, copyright, duplicate content, YouTube policy.
- **Deliverable path:** `content/ai-workflow/youtube-automation-n8n-pipeline.md`
- **Definition of done:** pipeline diagram, tool matrix, PoC sketch, risks section — all present.

### Issue #77 — Research terminal multiplexing workflow for Claude Code (cmux)

- **Type:** Research note + tool comparison
- **Primary agent:** `@writer` (objective = Optimize)
- **Secondary agents:** `@diagram` (pane / session topology, LR), `@reviewer`, `@content-ops`
- **Operational requirements:**
  - Confirm whether `cmux` in the XHS post refers to the generic term or a specific project; document both.
  - Comparison table across ≥3 candidates: `cmux`, `tmux`, `zellij`, WezTerm workspace / mux.
  - Propose 1 minimum-viable multi-pane workflow for Claude Code (agent pane / log pane / git-edit pane / long-task monitor pane).
  - Note constraints: remote sessions, IDE integration, state loss on detach.
- **Deliverable path:** `content/claude-code/terminal-multiplexing-workflow.md`
- **Definition of done:** tool identity confirmed; ≥3 tools compared; ≥1 workflow proposed with explicit limits.

## Agent Skillset Map

| Agent | Primary responsibility | Used in issues |
|---|---|---|
| `@writer` | Lean Quartz notes, evidence-based, objective-driven | #61, #74, #75, #76, #77 |
| `@reviewer` | Accuracy + style + completeness QA | #61, #74, #75, #76, #77 |
| `@diagram` | Mermaid `LR` flows where visualization earns its keep | #74, #75, #76, #77 |
| `@content-ops` | Taxonomy placement, frontmatter, index regen | #61, #74, #76, #77 |

## Execution Handoff

Per `cron/git-auto.md`:

1. Load `.automation/issues.json` (local state — never stage).
2. Consume this queue top-down; next run starts with **#61**.
3. For each picked issue: `git fetch origin && git checkout -B auto/issue-<n> origin/main`.
4. Apply the assigned agent(s), commit by explicit path, push, open one PR.
5. Record status transitions (`in_progress` → `pr_open` | `failed` | `blocked`) in the tracker only.

> This PR does not execute the queue — it ratifies the delegation plan that the automation loop will process on its next cycles.
