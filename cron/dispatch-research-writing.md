---
title: Research & Writing Issue Dispatch
date: 2026-04-13
source: cron/git-auto.md
---

## Scope

Audit of the open issue queue on `wahengchang/ai-study-note`, filtered to
research and writing tasks. Each filtered issue is mapped to the agent
registered in `claude/config.yaml` whose skill set matches the operational
requirements.

Bug fixes, infrastructure work, and framework migrations are excluded unless
their primary deliverable is a research note.

## Filter Results

Open issues scanned: **7**. Research/writing issues after filter: **6**.
Excluded: `#67` (layout/theme bug fix — routed to standard engineering flow).

| # | Title | Class | Primary Deliverable | Agent |
|---|---|---|---|---|
| 77 | Terminal multiplexing workflow for Claude Code (cmux) | Research | Tool comparison note + workflow recipe | `@writer` |
| 76 | AI-powered YouTube automation from n8n video | Research | End-to-end workflow note + tool inventory | `@writer` |
| 75 | LLM knowledge management with raw/wiki split | Research | Learn note on raw/wiki architecture | `@writer` |
| 74 | Astron Agent / Serper / Jina / Python / LLM roles | Writing | Publishable study note from prepared draft | `@writer` |
| 63 | Evaluate Mintlify as docs framework | Research | Evaluation memo + migration scoping | `@writer` → `@reviewer` |
| 61 | 開源 prompt 優化專案 (小紅書 research) | Research | Project identification + TL;DR summary |  `@writer` |

## Operational Requirements per Issue

### #77 — cmux / terminal multiplexing
- **Inputs**: Xiaohongshu link (partial), ambient knowledge of tmux/zellij.
- **Blockers**: Source content is partially collapsed; need to resolve whether `cmux` refers to the `cmux-sh/cmux` project or another tool before comparing.
- **Agent fit**: `@writer` (`formatting.md` + `quartz.md`) — produces the comparison table and minimum-viable workflow per the DoD.

### #76 — n8n YouTube automation workflow
- **Inputs**: YouTube video (Japanese), long tool list spanning orchestration/LLM/visual/audio/render/publish layers.
- **Blockers**: Requires careful structural breakdown to avoid turning into a raw tool dump; cost/policy risks must be called out.
- **Agent fit**: `@writer` — evidence-based, objective-driven output fits the "workflow + tool classification + PoC" deliverable.

### #75 — raw/wiki LLM knowledge management
- **Inputs**: User-supplied Chinese script, Karpathy + 林穎俊 references.
- **Blockers**: Must preserve the raw/wiki separation as the central framing; risk of drifting into generic KM content.
- **Agent fit**: `@writer` — "Architect" objective (design decisions and trade-offs) per `writer.md`.

### #74 — AI workflow parts study note
- **Inputs**: Pre-written Telegram draft covering Astron Agent, Serper.dev, Jina AI, Python node, LLM with pricing and roles.
- **Blockers**: Low — draft is already structured. Needs title, frontmatter, and link verification.
- **Agent fit**: `@writer` — pure writing pass; minimal research.

### #63 — Mintlify framework evaluation
- **Inputs**: Reference site (`agentskills.io`), repo context, existing Quartz setup.
- **Blockers**: Decision-scoped, not migration-scoped. Output must stop at evaluation + scoping; no file migration this round.
- **Agent fit**: `@writer` for the evaluation memo, then `@reviewer` to validate the decision framing before it becomes an implementation task.

### #61 — 寶藏開源 prompt 優化項目
- **Inputs**: Xiaohongshu share link only.
- **Blockers**: Original project identity unconfirmed; resolve before writing TL;DR.
- **Agent fit**: `@writer` — short research summary, 3+ reusable takeaways, fit-for-inclusion recommendation.

## Execution Protocol

Execution follows `cron/git-auto.md`:

1. **One issue per branch, one PR.** This dispatch manifest does not itself
   implement any issue — it only routes work.
2. Worker sessions pick **the lowest-numbered unblocked issue** (`#61`),
   branch from fresh `origin/main` as `auto/issue-<n>`, implement, validate
   with `npm run quartz -- build`, and open a single focused PR.
3. Issues requiring user clarification (`#77`, `#61` — source identity) must
   leave a clarification comment and mark `clarification_needed` before
   proceeding.
4. `#63` is **decision-scoped** — deliver an evaluation memo only; do not
   start migration work in the same PR.

## Queue Order (lowest-blocked first)

1. `#61` — identify project, then TL;DR
2. `#63` — Mintlify evaluation memo
3. `#74` — study note (lowest research overhead)
4. `#75` — raw/wiki learn note
5. `#76` — n8n YouTube workflow
6. `#77` — cmux workflow comparison

## Non-Goals

- No bulk content migration.
- No taxonomy changes — `@content-ops` is not dispatched this cycle.
- No diagram-only tasks — `@diagram` is not dispatched this cycle.
