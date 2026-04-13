---
title: Research & Writing Queue — Agent Delegation Plan
---

## Scope

Orchestration artifact for `cron/git-auto.md`. Each run picks the **lowest-numbered `pending`** item below, branches fresh from `origin/main` (`auto/issue-<n>`), delegates to the listed agent, commits the deliverable, and opens one PR.

- Audit date: 2026-04-13
- Filter: research and writing only (bug/layout issues are excluded from this queue)
- Excluded from this queue: #67 (bug fix — route to a separate dev lane)

## Agent Skill Matrix

| Agent | Responsibility | Prompts |
|-------|----------------|---------|
| `@writer` | Convert research/workflows into Quartz notes under `content/` | formatting, mermaid, quartz |
| `@diagram` | Generate/refactor Mermaid diagrams (LR) | mermaid |
| `@reviewer` | Final QA: structure, accuracy, style, completeness | formatting, quartz |
| `@content-ops` | Taxonomy, placement, frontmatter, index regeneration | formatting, quartz |

Every research/writing issue ships through: `@writer` (draft) → `@diagram` (if visualization adds clarity) → `@reviewer` (gate) → `@content-ops` (placement/index) → PR.

## Queue

### #61 — 研究小紅書：自動優化提示詞開源項目 — `pending`

- **Primary agent**: `@writer`
- **Supporting**: `@reviewer`, `@content-ops`
- **Operational requirements**:
  - Resolve the original XHS post to a concrete project (repo + docs).
  - Extract: TL;DR (3–5 lines), core features, usage flow, ≥3 reusable takeaways.
  - Recommend inclusion verdict for `ai-study-note`.
- **Deliverable**: `content/prompt-notes/<kebab-case>.md`
- **Branch**: `auto/issue-61`

### #63 — Evaluate Mintlify as docs framework — `pending`

- **Primary agent**: `@writer`
- **Supporting**: `@reviewer`
- **Operational requirements**:
  - Inventory Mintlify stack (Next.js, MDX, Tailwind) and feature coverage vs. current Quartz site.
  - Compare search, theming, content model, CI/deploy.
  - Decision-ready recommendation: adopt / defer / reject with evidence.
- **Deliverable**: `content/setup-env/mintlify-evaluation.md` (research note — no implementation)
- **Branch**: `auto/issue-63`

### #74 — Study note: Astron Agent / Serper / Jina / Python node / LLM — `pending`

- **Primary agent**: `@writer`
- **Supporting**: `@diagram` (workflow role map, LR), `@reviewer`, `@content-ops`
- **Operational requirements**:
  - Convert provided Telegram draft into a publishable note.
  - Clarify each component's role in an AI workflow (model / tool / platform / logic node).
  - Cost posture per component (free tier vs. paid) with official links.
  - Include a Mermaid LR diagram showing component handoffs.
- **Deliverable**: `content/claude-code/ai-workflow-components.md` (or equivalent per taxonomy)
- **Branch**: `auto/issue-74`

### #75 — Learn note: LLM-based knowledge management (raw + wiki) — `pending`

- **Primary agent**: `@writer`
- **Supporting**: `@diagram` (raw → wiki feedback loop, LR), `@reviewer`
- **Operational requirements**:
  - Document the raw/wiki two-layer separation: raw is immutable source; wiki is the evolving knowledge layer.
  - Capture Karpathy + 林穎俊 references and the user's simplification.
  - Show how queries re-feed new insights back to wiki.
  - Low-friction implementation hint: IDE + Obsidian + Markdown + Git.
- **Deliverable**: `content/claude-code/llm-knowledge-mgmt-raw-wiki.md`
- **Branch**: `auto/issue-75`

### #76 — Research: n8n YouTube automation workflow — `pending`

- **Primary agent**: `@writer`
- **Supporting**: `@diagram` (end-to-end pipeline, LR), `@reviewer`, `@content-ops`
- **Operational requirements**:
  - Decompose the video's pipeline: topic → script → visuals → audio → assembly → publish → logging.
  - Catalogue each tool tier (orchestration, LLM, visual, audio, render, publish, storage/notify) with use case, pros, limits.
  - Flag cost, copyright, and YouTube policy risks.
  - Propose a minimum viable PoC architecture.
- **Deliverable**: `content/claude-code/n8n-youtube-automation.md`
- **Branch**: `auto/issue-76`

### #77 — Research: terminal multiplexing for Claude Code — `pending`

- **Primary agent**: `@writer`
- **Supporting**: `@diagram` (multi-pane layout, LR), `@reviewer`
- **Operational requirements**:
  - Identify the actual project referenced in the XHS post (`cmux` vs. alternatives).
  - Compare ≥3 tools: cmux, tmux, zellij (+ WezTerm/Warp where relevant).
  - Enumerate Claude Code pane patterns: agent / logs / edit+git / long-task monitor.
  - Produce one minimum-viable workflow and note its limits.
- **Deliverable**: `content/claude-code/terminal-multiplexing-workflow.md`
- **Branch**: `auto/issue-77`

## Execution Protocol

1. Read `cron/git-auto.md` invariants.
2. Pick the lowest-numbered `pending` item above.
3. Mark it `in_progress` in `.automation/issues.json` **only** (never commit that file).
4. `git fetch origin && git checkout -B auto/issue-<n> origin/main`.
5. Run the assigned agent; produce the deliverable under `content/`.
6. Verify: `npm run check` and `npm run quartz -- build` both exit 0.
7. Stage files by explicit path; never `git add .` / `git add -A`.
8. Commit with conventional message: `feat: <note> (closes #<n>)`.
9. Push and open one PR targeting `main`.
10. On merge, flip the item here to `done` in the next queue-maintenance commit.

## Status Legend

- `pending` — ready for pickup
- `in_progress` — a run is actively working it (see `.automation/issues.json`)
- `blocked` — needs user clarification or is out of scope for a single run
- `done` — merged to `main`
