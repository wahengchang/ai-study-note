---
title: Dispatch — Research & Writing Queue (2026-04-12)
---

## Purpose

Kickoff artifact for [`cron/git-auto.md`](./git-auto.md). Filters the open issue queue to research and writing work, records operational requirements, and assigns a `claude/config.yaml` agent per issue.

## Scope filter

Included: any issue whose deliverable is a Quartz study note, research note, or learn note under `content/`.

Excluded:

- `#67` — bug fix (duplicate H1 titles). Engineering work on layout/content, not authoring. Out of scope.
- `#63` — framework migration planning (Mintlify). Infra/architecture, not a note deliverable. Out of scope.

## Filtered queue (lowest issue number first per git-auto.md §4)

| # | Title | Deliverable | Primary agent | Support | Notes |
|---|-------|-------------|---------------|---------|-------|
| 61 | Research Xiaohongshu post on prompt-optimization OSS project | Research summary note | `@writer` | `@reviewer` | Source-verification step required before writeup |
| 74 | Write study note: Astron Agent / Serper / Jina / Python node / LLM | Study note (workflow-parts framing) | `@writer` | `@reviewer` | Source material already supplied by user |
| 75 | Research LLM-based knowledge management (raw + wiki) | Learn note | `@writer` | `@diagram`, `@reviewer` | Diagram clarifies raw→wiki→query loop |
| 76 | Research n8n AI-powered YouTube automation workflow | Research note + tool matrix | `@writer` | `@diagram`, `@reviewer` | Workflow flowchart (LR) + cost/risk table |
| 77 | Research cmux / terminal multiplexing for Claude Code | Research note + tool comparison | `@writer` | `@diagram`, `@reviewer` | Verify identity of `cmux` before any claim |

## Per-issue operational requirements

### #61 — Prompt-optimization OSS research

- **Inputs**: Xiaohongshu short link (http://xhslink.com/o/7iAalKtM6SX) — content truncated; must resolve the target repo first.
- **Blocking step**: if the referenced project cannot be identified from the post, leave a clarification comment on the issue and mark `clarification_needed` per git-auto.md §4.
- **Deliverable shape**: TL;DR (3–5 lines), core features, ≥3 reusable takeaways, fit verdict for `ai-study-note`.
- **Placement**: per `docs/content-taxonomy.md` (research/prompt-engineering branch).
- **Agent**: `@writer`; post-draft `@reviewer` audit.

### #74 — Workflow parts study note

- **Inputs**: user-supplied Telegram note covering Astron Agent, Serper.dev, Jina AI, Python node, LLM — role, pricing, official links.
- **Framing**: workflow-parts, not "another AI tool". Keep plain-language version in the note.
- **Deliverable shape**: title + outline + per-tool one-liner + pricing column + closing synthesis.
- **Agent**: `@writer`; `@reviewer` for terminology consistency.

### #75 — Raw / wiki LLM KM note

- **Inputs**: user narrative + Karpathy / 林穎俊 references.
- **Deliverable shape**: two-layer (raw vs. wiki) separation explained; ingestion loop; query-and-writeback loop; why it fits personal KM.
- **Diagram**: single Mermaid `flowchart LR` for `raw → LLM → wiki → query → wiki' (writeback)`.
- **Agent**: `@writer` for prose; `@diagram` for the flowchart; `@reviewer` to gate publish.

### #76 — n8n YouTube automation research

- **Inputs**: YouTube video (5Htbfh_LYSE) covering n8n + LLM + media stack + publishing.
- **Deliverable shape**: end-to-end workflow breakdown, tool inventory grouped by stage (orchestration / LLM / visual / audio / assembly / publishing / ops), PoC minimum version, risks (cost, copyright, YT policy).
- **Diagram**: workflow flowchart (LR only). Include decision nodes for cost gates.
- **Agent**: `@writer` for structure and risk framing; `@diagram`; `@reviewer` for completeness against the issue's acceptance list.

### #77 — cmux / terminal multiplexing research

- **Inputs**: Xiaohongshu link (xhslink.com/o/AAbGLpO7BY4); `cmux` identity unconfirmed.
- **Blocking step**: confirm whether the post refers to the known `cmux` project or something else before producing comparison claims.
- **Deliverable shape**: tool identity, feature surface, comparison table (cmux vs. tmux / zellij / WezTerm mux), minimum Claude Code workflow, limits.
- **Diagram** (optional): pane-layout sketch if it clarifies the recommended workflow.
- **Agent**: `@writer`; `@diagram` if the pane sketch lands; `@reviewer`.

## Shared execution rules (enforced per `CLAUDE.md` and `claude/prompts/*`)

- File naming: `kebab-case`, under 60 chars.
- Frontmatter: `title` required; add `description` and `tags` per `docs/content-taxonomy.md`.
- Markdown: no duplicate in-body `# H1` matching the frontmatter title (also guards against regression of #67).
- Mermaid: `direction LR` only. Skip a diagram if it does not improve comprehension.
- Code blocks: language identifier required.
- Evidence: no unverifiable claims; flag assumptions with `> [!warning]`.

## Execution contract with `cron/git-auto.md`

- One issue per branch; branch name `auto/issue-<n>` cut fresh from `origin/main`.
- One PR per issue. Do not bundle issues.
- Stage files by explicit path. `.automation/` stays local per the invariants.
- On validation failure (`npm run quartz -- build` non-zero), mark tracker `failed` and stop the run — do not force-push a broken build.
- Dispatch order for subsequent runs: **61 → 74 → 75 → 76 → 77** (lowest open number first; skip any that have acquired a live PR between runs).

## Acceptance for this dispatch PR

- [ ] Filter rationale covers every open issue (7 total, 5 queued, 2 excluded with reason).
- [ ] Every queued issue has an agent assignment that matches the deliverable.
- [ ] Execution contract references `cron/git-auto.md` verbatim (branch, staging, one-PR-per-issue).
- [ ] No content under `content/` is modified by this PR — it is dispatch metadata only.
