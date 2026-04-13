---
title: "Cron dispatch — research/writing issue queue (2026-04-13 / ofos9)"
---

## Purpose

Kickoff artifact for `cron/git-auto.md`. Audits the open issue queue, filters
to research and writing tasks, records operational requirements per issue, and
delegates to agents from `claude/config.yaml`. This file is a manifest only —
it does not implement any issue. Per the invariant `One issue per branch, one
branch per PR`, each queued issue is picked up on a later run from a fresh
`origin/main` branch.

## Preflight (per `cron/git-auto.md` §1)

- `git fetch origin` — succeeded
- `git status --porcelain` — clean
- `git rev-parse HEAD origin/main` — both at `bc7dd17` (branch is 0 ahead / 0 behind)
- `.automation/` — not present in repo, nothing to stage
- Working branch — `claude/gracious-hawking-ofos9` (session-designated)

## Issue queue audit (7 open)

| #  | Title                                                                | Category            | Open PR  | Disposition                       |
| -- | -------------------------------------------------------------------- | ------------------- | -------- | --------------------------------- |
| 61 | (Research) 小紅書 prompt-optimization OSS                              | research            | #73      | skip — implementation in flight   |
| 63 | Adopt Mintlify as new framework for ai-study-note                    | infra / evaluation  | #124     | skip — evaluation in flight       |
| 67 | Fix duplicate article titles                                         | bug fix             | #68      | exclude — not research/writing    |
| 74 | Write study note: Astron / Serper / Jina / Python / LLM              | writing             | #121     | skip — implementation in flight   |
| 75 | Research LLM-based KM (raw / wiki workflow)                          | research + writing  | #120     | skip — implementation in flight   |
| **76** | **Research n8n AI YouTube automation workflow**                  | **research**        | **none** | **queue → `@writer` + `@diagram`**|
| **77** | **Research cmux / terminal multiplexing for Claude Code**        | **research**        | **none** | **queue → `@writer`**             |

Filter rule: research and writing only. `#67` is excluded (engineering/layout
bug). `#63` is included as research/evaluation but already covered by `#124`.

Dispatch order per `cron/git-auto.md` §4 (lowest number first, skipping issues
with an open PR): **`#76` → `#77`**.

## Per-issue operational requirements

### `#76` — Research n8n AI YouTube automation workflow

| Field               | Value                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| Primary agent       | `@writer`                                                                                      |
| Supporting          | `@diagram` (LR Mermaid for stage → tool-chain), `@reviewer` (publish gate)                     |
| Source material     | YouTube video (Japanese): `https://www.youtube.com/watch?v=5Htbfh_LYSE` + issue body taxonomy  |
| Inputs needed       | Video transcript / summary; tool docs (n8n, Fal.ai, Kling, Veo3, ElevenLabs, json2video, etc.) |
| Discovery cost      | Medium-high — many tool categories to confirm pricing tiers and policy gotchas                 |
| Blocking checks     | Confirm tools that are still active in 2026; flag any deprecated / replaced offerings          |
| Deliverable shape   | One `content/<topic>/n8n-youtube-automation.md` study note + tool category table + PoC sketch  |
| Acceptance (issue)  | Workflow stages mapped, tools categorized with use/limit/cost, ≥1 PoC, risks called out        |
| Risk notes          | Copyright, YouTube policy, repetitive content; PRC vs global tool availability                 |
| Execution contract  | Branch `auto/issue-76` from fresh `origin/main`; one commit; explicit-path staging only        |

### `#77` — Research cmux / terminal multiplexing for Claude Code

| Field               | Value                                                                                              |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| Primary agent       | `@writer`                                                                                          |
| Supporting          | `@reviewer` (publish gate); `@diagram` only if a comparison matrix benefits from a flowchart       |
| Source material     | 小紅書 link in issue body — original content not fully expanded                                       |
| Inputs needed       | Identify the actual `cmux` project (multiple OSS projects share the name); compare to tmux/zellij  |
| Discovery cost      | Medium — tool identity must be verified before any comparison or recommendation can be written     |
| Blocking checks     | If the source link is dead or the tool identity ambiguous → leave clarification comment on `#77`   |
| Deliverable shape   | `content/claude-code/terminal-multiplexing-workflow.md` + comparison table + minimal workflow      |
| Acceptance (issue)  | Source tool identified, ≥3 comparable tools/workflows, ≥1 actionable Claude Code workflow          |
| Risk notes          | Don't fabricate `cmux` claims if origin link can't be confirmed — surface the ambiguity instead    |
| Execution contract  | Branch `auto/issue-77` from fresh `origin/main`; one commit; explicit-path staging only            |

## Agent delegation rationale (per `claude/config.yaml`)

- **`@writer`** — primary on every queued item. Both `#76` and `#77` are
  technical research notes whose deliverable is prose + tables, the writer
  agent's stated objective.
- **`@diagram`** — added on `#76` because the YouTube workflow has a
  stage → tool-chain mapping that benefits from an LR Mermaid flowchart.
  Not added on `#77` until a comparison shape is justified by content.
- **`@reviewer`** — gates every publish (style, accuracy, frontmatter,
  no duplicate H1, build green).

## Shared execution rules (apply to every queued run)

- Filename: `kebab-case`, under 60 characters
- Frontmatter: `title` required (project default)
- Body: do not repeat the frontmatter title as an in-body `# H1` (per `#67`)
- Mermaid: `direction LR` only — never `TD`
- Build gate: `npm run quartz -- build` exits 0 before push
- Style gate: `npm run check` passes

## Git-auto invariants honored by this PR

- [x] `.automation/` not staged (no such directory exists)
- [x] Files staged by explicit path (only `cron/dispatch-2026-04-13-ofos9.md`)
- [x] Branch aligned with `origin/main` tip at start (`bc7dd17`)
- [x] No `git add .`, `git add -A`, `git commit -a`
- [x] Single non-empty commit, single PR — manifest only, no `content/` edits
- [x] No queued issue is being implemented in this PR (deferred to per-issue runs)

## Next runs

1. Next `cron/git-auto.md` run → branch `auto/issue-76` off fresh
   `origin/main` → `@writer` + `@diagram` → PR closing `#76`.
2. Run after → branch `auto/issue-77` off fresh `origin/main` →
   `@writer` (+ source-identity verification step) → PR closing `#77`.
