---
title: Execution Queue — Research & Writing Backlog
---

> Runbook: [`cron/git-auto.md`](./git-auto.md) — one issue per branch, one branch per PR, lowest issue number first.

## Context

Audit of open issues on `wahengchang/ai-study-note`, filtered to **research & writing** tasks only. Each row maps the issue to an agent under `claude/agents/` based on the deliverable. Bug/layout issues are excluded from this queue.

## Filter Rule

- **Include**: research notes, study notes, evaluations, technical write-ups, workflow breakdowns.
- **Exclude**: layout fixes, build/infra, duplicate-title cleanup, frontmatter-only maintenance.

## Scoreboard

| # | Issue | Primary Deliverable | Agent | Supporting | Priority |
|---|-------|---------------------|-------|------------|----------|
| 61 | 小紅書寶藏開源提示詞優化專案研究 | Research summary + recommendation | `@writer` | `@reviewer` | P1 |
| 63 | Adopt Mintlify as new docs framework | Decision/architect note | `@writer` | `@reviewer` | P2 |
| 74 | Study note — Astron Agent / Serper / Jina / Python node / LLM | Publishable study note | `@writer` | `@diagram` | P1 |
| 75 | Learn note — LLM-based raw/wiki knowledge management | Study note + workflow outline | `@writer` | `@diagram` | P1 |
| 76 | Research — n8n AI YouTube automation workflow | Research note + tool taxonomy + PoC | `@writer` | `@diagram` | P2 |
| 77 | Research — cmux / terminal multiplexing for Claude Code | Research note + comparison table | `@writer` | `@reviewer` | P2 |

**Excluded**: `#67` (duplicate article titles — layout/content-ops task, not research/writing).

## Per-Issue Operational Analysis

### #61 — 小紅書開源提示詞優化專案
- **Inputs**: xhslink.com post, unknown target repo.
- **Ops**: confirm source project → TL;DR → 3 reusable takeaways → adoption verdict.
- **Agent**: `@writer` (research summary under `content/research/`). `@reviewer` for final pass.
- **Risk**: source link may not resolve — escalate as `clarification_needed` per runbook §4.

### #63 — Mintlify framework evaluation
- **Inputs**: agentskills.io reference, current Quartz setup.
- **Ops**: capability matrix (Mintlify vs Quartz) → migration cost → go/no-go recommendation.
- **Agent**: `@writer` classify as **Architect** (per `writer.md` §Behavior). `@reviewer` checks accuracy of claims about Next.js/MDX/Tailwind stack.
- **Risk**: do NOT start migration — scope is decision artifact only.

### #74 — Astron Agent / Serper / Jina / Python node / LLM
- **Inputs**: Telegram source material (already summarized by user).
- **Ops**: per-tool role table (model vs tool vs platform vs logic node) → pricing row → single-workflow integration narrative.
- **Agent**: `@writer` primary. `@diagram` for the LR workflow graph (optional, only if it adds clarity).
- **Risk**: acceptance requires non-technical readability — keep one plain-language pass.

### #75 — Raw/Wiki LLM knowledge management
- **Inputs**: user Facebook share + Chinese writeup; Karpathy / 林穎俊 references.
- **Ops**: separate raw-layer vs wiki-layer design → AI-driven consolidation loop → query/writeback cycle.
- **Agent**: `@writer`. `@diagram` for the raw→wiki→query feedback loop (LR).
- **Risk**: adjacent to `#65` Karpathy note already merged in `bc7dd17` — cross-link, do not duplicate.

### #76 — n8n YouTube automation
- **Inputs**: JP-language YouTube walkthrough.
- **Ops**: end-to-end pipeline breakdown → tool inventory by category → PoC scope → risk section (copyright, YouTube policy, duplicate content).
- **Agent**: `@writer`. `@diagram` for the orchestration LR graph.
- **Risk**: largest scope — consider splitting into workflow-note + tool-index if draft exceeds single-page density.

### #77 — cmux / terminal multiplexing for Claude Code
- **Inputs**: xhslink post (likely truncated), cmux identity unconfirmed.
- **Ops**: confirm actual tool (cmux vs tmux/zellij/WezTerm) → comparison table → Claude Code pane workflow recipe.
- **Agent**: `@writer`. `@reviewer` validates the comparison table.
- **Risk**: source ambiguity — if real target cannot be identified, downgrade to tmux/zellij/Claude-Code-workflow note and file a follow-up issue for cmux specifics.

## Execution Order (per runbook)

Lowest issue number first, one at a time:

1. `#61` → branch `auto/issue-61`
2. `#63` → branch `auto/issue-63`
3. `#74` → branch `auto/issue-74`
4. `#75` → branch `auto/issue-75`
5. `#76` → branch `auto/issue-76`
6. `#77` → branch `auto/issue-77`

## Guardrails (from `git-auto.md`)

- Branch fresh from `origin/main` each run; do not reuse stale local branches.
- Stage by explicit path only. Never `git add .` / `-A`. Never stage `.automation/`.
- One issue per PR. No bundled cleanups.
- On ambiguous source material → `clarification_needed` and stop.
- Validation gate: `npm run check` and `npm run quartz -- build` must exit 0 before push.
