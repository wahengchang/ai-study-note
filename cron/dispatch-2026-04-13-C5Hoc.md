---
title: Research/Writing Issue Dispatch (2026-04-13)
---

## Purpose

Audit the open issue queue, filter for research and writing tasks, map each to
the right agent in `claude/config.yaml`, and set the deterministic order consumed
by `cron/git-auto.md` on subsequent runs (one issue per branch, lowest number
first).

## Audit Summary

| # | Issue | Category | State | Disposition |
|---|-------|----------|-------|-------------|
| 61 | 小紅書自動優化提示詞開源專案 | Research | `clarification_needed` (source 302 → JS + login wall) | Blocked — await owner input |
| 63 | Adopt Mintlify as docs framework | Research (evaluation) | `pr_open` → #124 | Skip — already in flight |
| 67 | Fix duplicate article titles | Bug / layout | Excluded | Not research/writing |
| 74 | Astron Agent / Serper / Jina / Python / LLM study note | Writing | `pr_open` → #121 | Skip — already in flight |
| 75 | LLM raw/wiki knowledge management note | Research + Writing | `pr_open` → #120 | Skip — already in flight |
| 76 | n8n AI YouTube automation workflow | Research | Open, actionable | Queue for next run |
| 77 | cmux terminal multiplexing for Claude Code | Research | Open, actionable | Queue for next run |

**Filtered queue** (research/writing, not already covered by an open PR):
`#76`, `#77`. Plus `#61` once clarification arrives.

## Operational Requirements

### #76 — n8n AI YouTube automation workflow

- **Inputs**: YouTube link in issue body; tool list (n8n, Fal.ai, Kling, Veo3,
  Suno, ElevenLabs, json2video, etc.).
- **Risks**: Non-English source video; copyright and YouTube policy guardrails
  must be surfaced; tool list is long — note must categorize, not enumerate.
- **Deliverable**: `content/workflow-notes/n8n-youtube-automation.md` with
  workflow decomposition, tool matrix (orchestration / LLM / visual / audio /
  render / publish / ops), one PoC architecture, risk section.
- **Acceptance**: End-to-end workflow laid out; at least one PoC scoped;
  explicit copyright/policy/quality callouts.

### #77 — cmux terminal multiplexing for Claude Code

- **Inputs**: 小紅書 short link (likely paywalled) + topic "cmux × Claude Code".
- **Risks**: Source may again be unscrapeable; `cmux` is ambiguous (multiple
  projects share the name). The note must disambiguate before recommending.
- **Deliverable**: `content/workflow-notes/cmux-claude-code-workflow.md` with
  tool identification, comparison matrix (cmux / tmux / zellij / WezTerm mux),
  one minimum-viable workflow (pane layout for agent / logs / edit / long-run).
- **Acceptance**: ≥3 multiplexers compared; ≥1 concrete Claude Code workflow;
  scope/limits stated.

### #61 — 小紅書 auto prompt-optimizer OSS *(blocked)*

- Source post is JS-rendered behind a login wall; cannot be scraped
  deterministically (see existing comment on the issue).
- Resume when the owner supplies the repo link / screenshot / transcript.

## Agent Delegation

Agents are registered in `claude/config.yaml`; paths resolve under
`claude/agents/`.

| Issue | Primary | Support | Why |
|-------|---------|---------|-----|
| #76 | `@writer` | `@diagram`, `@reviewer` | Long workflow → structured note + LR mermaid; review for tool accuracy |
| #77 | `@writer` | `@diagram`, `@reviewer` | Comparison table + workflow diagram |
| #61 | `@writer` | `@reviewer` | Pure note once source confirmed |

Non-research/writing backlog (for reference, not dispatched here):

- `#67` → `@content-ops` (frontmatter rule + template audit) and possibly a
  layout-level fix in `quartz.layout.ts`.

## Execution Order for `cron/git-auto.md`

Per the invariants in `cron/git-auto.md` (lowest-number open issue first, one
issue per branch, branch fresh from `origin/main`):

1. `#76` — next run picks this up first.
2. `#77` — following run.
3. `#61` — only after clarification comment is resolved.

Each run must:

- `git fetch origin && git checkout -B auto/issue-<n> origin/main`
- Stage files by explicit path (never `git add -A`; never stage `.automation/`).
- Produce exactly one PR per issue; reference `closes #<n>` in the body.
- On validation failure, mark the tracker `failed` and stop.

## Definition of Done (for this dispatch PR)

- [x] Open issues audited; research/writing filtered from bug/layout work.
- [x] In-flight PRs (`#120`, `#121`, `#124`) recorded to prevent duplicate work.
- [x] Operational requirements written per actionable issue.
- [x] Primary + support agent recorded per issue.
- [x] Execution order set so `cron/git-auto.md` runs are deterministic.
