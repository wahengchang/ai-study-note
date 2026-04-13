---
title: Issue Queue Audit — Research & Writing Delegation
---

## Context

Audit of the open issue queue for `wahengchang/ai-study-note`, filtered to research and writing tasks. Each filtered issue is mapped to the agent best suited to execute it under the `cron/git-auto.md` workflow. Execution order follows the cron invariant: **one issue per run, lowest number first**.

## Scope Filter

| Issue | Title (abbreviated) | Kind | Filter decision |
|---|---|---|---|
| #61 | 小紅書 prompt optimizer open-source project | Research | **Included** — research note |
| #63 | Adopt Mintlify as new framework | Planning / architecture | Excluded — framework migration, not a note |
| #67 | Fix duplicate article titles | Bug / content-ops | Excluded — engineering fix |
| #74 | Study note on Astron Agent, Serper, Jina AI, Python node, LLM | Writing | **Included** — writing-first |
| #75 | LLM-based knowledge management (raw/wiki) learn note | Research + writing | **Included** |
| #76 | AI YouTube automation workflow (n8n) research | Research | **Included** |
| #77 | Terminal multiplexing (cmux) for Claude Code | Research | **Included** |

Five issues pass the research/writing filter. Two are excluded and tracked separately.

## Delegation Matrix

All five filtered issues route to `@writer`. Rationale: every deliverable is a Quartz Markdown note under `content/` requiring evidence-based technical prose, and `writer.md` already composes `formatting.md` + `mermaid.md` + `quartz.md` prompt fragments. `@reviewer` is queued as a post-draft gate for each note. `@content-ops` handles only taxonomy placement on intake.

| # | Agent | Prompt fragments | Post-draft gate |
|---|---|---|---|
| 61 | writer | formatting, quartz | reviewer |
| 74 | writer | formatting, quartz | reviewer |
| 75 | writer | formatting, mermaid, quartz | reviewer |
| 76 | writer | formatting, mermaid, quartz | reviewer |
| 77 | writer | formatting, mermaid, quartz | reviewer |

## Operational Requirements

### Issue #61 — 小紅書 prompt optimizer research
- **Objective classification**: Architect (survey).
- **Inputs**: Xiaohongshu shortlink `http://xhslink.com/o/7iAalKtM6SX`; existing comment thread.
- **Research steps**: resolve the shortlink, identify the OSS repo, capture TL;DR (3–5 lines), core features, applicable scenarios, ai-study-note fit verdict.
- **Target path**: `content/prompt-notes/<kebab-case>.md`.
- **Risk**: source link may have rotted; agent must fail loud and request clarification rather than guess.
- **Definition of Done**: 3+ reusable takeaways, inclusion verdict, no unverified claims.

### Issue #74 — Astron Agent / Serper / Jina AI / Python node / LLM study note
- **Objective classification**: Architect (workflow anatomy).
- **Inputs**: Telegram source blurb supplied by user (already summarized in issue body).
- **Required sections**: title, one-liner per component, role-in-workflow (model vs tool vs platform vs logic node), free-tier vs paid, official links, closing synthesis that frames the diagram as workflow parts — not a monolithic AI tool.
- **Target path**: `content/ai-workflow/<kebab-case>.md` (or nearest existing taxonomy folder — content-ops confirms on intake).
- **Style constraint**: plain-language pass that non-technical readers can follow.

### Issue #75 — Raw/wiki LLM knowledge management learn note
- **Objective classification**: Architect.
- **Inputs**: user-supplied Chinese narrative; Andrej Karpathy + 林穎俊 references.
- **Required content**: raw vs wiki separation, AI-assisted consolidation loop, query-driven enrichment, IDE + Obsidian + Markdown + Git implementation sketch.
- **Mermaid**: one LR diagram showing raw → wiki → query → write-back loop.
- **Target path**: `content/claude-code/<kebab-case>.md` or equivalent under the knowledge-management taxonomy — intake-confirmed.
- **Out of scope**: production architecture, exhaustive tool comparison.

### Issue #76 — n8n AI YouTube automation workflow
- **Objective classification**: Architect (end-to-end workflow).
- **Inputs**: YouTube URL `https://www.youtube.com/watch?v=5Htbfh_LYSE`.
- **Required deliverables**: workflow breakdown (ideation → script → visuals → audio → render → publish → telemetry), tool roster by category, cost/risk/policy callouts, one PoC sketch for a minimal viable pipeline.
- **Mermaid**: one LR pipeline diagram.
- **Risk flags**: copyright, YouTube re-used-content policy, per-API cost, zh-TW adaptability.
- **Target path**: `content/ai-workflow/<kebab-case>.md` — intake-confirmed.

### Issue #77 — cmux terminal multiplexing for Claude Code
- **Objective classification**: Optimize (productivity workflow).
- **Inputs**: Xiaohongshu shortlink `http://xhslink.com/o/AAbGLpO7BY4`.
- **Research steps**: confirm the tool identity (`cmux` vs alternative project), contrast against `tmux`, `zellij`, `screen`, WezTerm workspace, Warp; map pane roles (agent / logs / edit-git-test / long-running monitor) to Claude Code workflows.
- **Deliverables**: comparison table, one recommended minimal workflow, explicit limits.
- **Target path**: `content/claude-code/<kebab-case>.md`.
- **Risk**: if the referenced tool is misidentified, agent must document the ambiguity rather than ship a wrong attribution.

## Execution Plan — `cron/git-auto.md` Kickoff

The cron picks one issue per run, lowest number first, and skips any issue that already has an open PR. Given the current queue, runs execute in this order:

```
Run 1 → #61   writer  → auto/issue-61
Run 2 → #74   writer  → auto/issue-74
Run 3 → #75   writer  → auto/issue-75
Run 4 → #76   writer  → auto/issue-76
Run 5 → #77   writer  → auto/issue-77
```

Each run MUST:

1. Branch fresh from `origin/main`: `git fetch origin && git checkout -B auto/issue-<n> origin/main`.
2. Mark the issue `in_progress` in `.automation/issues.json` **before** starting work. Never stage or commit `.automation/`.
3. Invoke `@writer` with the composed prompt fragments listed in the matrix above.
4. Run `@reviewer` as a pre-commit gate on the draft note.
5. `npm run check` and `npm run quartz -- build` must exit 0.
6. Stage files by explicit path only — no `git add .`, no `git add -A`, no `-a` commit.
7. Push and open exactly one PR per issue. On validation failure, mark `failed` in the tracker and stop.

## Out-of-Scope Issues (Tracked Separately)

- **#63** — Mintlify adoption: requires architecture decision + migration plan; does not fit writer/reviewer agents. Route to a planning track.
- **#67** — Duplicate article titles: route to `@content-ops` or an engineering fix; not a research/writing task.

## Acceptance Criteria for This Audit

- [x] Open issues enumerated from the live GitHub queue
- [x] Research + writing filter applied with explicit rationale per issue
- [x] Each filtered issue mapped to an agent with operational requirements
- [x] Execution order aligned with `cron/git-auto.md` invariants
- [x] Out-of-scope issues recorded with their disposition
