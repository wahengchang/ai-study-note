---
title: Issue Queue Triage — Research & Writing Delegation
---

## Context

Triage snapshot of the open issue queue, filtered for **research and writing** tasks
and delegated to agents in `claude/agents/`. Output is consumed by the cron loop in
[`cron/git-auto.md`](../cron/git-auto.md), which picks one issue per run (lowest
number first), branches off `origin/main` as `auto/issue-<n>`, and opens one PR.

- **Snapshot date**: 2026-04-15
- **Source**: `mcp__github__list_issues` against `wahengchang/ai-study-note` (state=OPEN)
- **Filter**: research notes, writing tasks, learn-note authoring (excludes bug fixes,
  layout work, infra)

## Filter Result

| # | Title | Labels | Match | Reason |
|---|-------|--------|-------|--------|
| 77 | Research terminal multiplexing workflow that boosts Claude Code productivity | documentation, enhancement | ✅ | Research note + tool comparison |
| 76 | Research AI-powered YouTube automation workflow from n8n video | documentation, enhancement | ✅ | Research note + tool inventory |
| 75 | Research learn note on LLM-based knowledge management with raw and wiki workflow | documentation, enhancement | ✅ | Learn note authoring |
| 74 | Write study note on Astron Agent, Serper, Jina AI, Python node, and LLM | documentation, enhancement | ✅ | Study note authoring from source material |
| 67 | Fix duplicate article titles on ai-study-note pages | — | ❌ | Layout/template bug — not research/writing |
| 61 | (Research) 研究小紅書：寶藏開源項目，自動優化專業級提示詞 | — | ✅ | Research summary of open-source project |

**Filtered set**: #61, #74, #75, #76, #77 (5 issues).
**Excluded**: #67 (bug fix — out of scope for this triage).

## Agent Roster

| Agent | Skill set | Source |
|-------|-----------|--------|
| `@writer` | Note authoring (research / study / learn / debug / deploy) | `claude/agents/writer.md` |
| `@reviewer` | Editorial QA on accuracy, structure, style | `claude/agents/reviewer.md` |
| `@diagram` | Mermaid generation/refactor (LR only, dark-theme) | `claude/agents/diagram.md` |
| `@content-ops` | Taxonomy enforcement, frontmatter, file placement | `claude/agents/content-ops.md` |

## Per-Issue Operational Analysis

### Issue #61 — 寶藏開源項目，自動優化專業級提示詞
- **Type**: Research summary
- **Inputs**: 小紅書 link `http://xhslink.com/o/7iAalKtM6SX`
- **Operations**:
  1. Resolve the open-source project referenced in the post (web research required).
  2. Produce TL;DR, core features, application scenarios, and a fitness verdict for `ai-study-note`.
- **Risks**: XHS link may be unresolvable from server-side fetch; flag with `> [!warning]` and document fallback search terms.
- **Primary agent**: `@writer` (Research objective).
- **Secondary**: `@content-ops` for placement/tags; `@reviewer` for final pass.
- **Target path**: `content/research-notes/<kebab-case>.md` (final folder per taxonomy decision tree).
- **DoD**: project source confirmed, ≥3 reusable points, fitness conclusion.

### Issue #74 — Astron Agent, Serper, Jina AI, Python node, LLM
- **Type**: Study note (source material already provided by user via Telegram).
- **Inputs**: User's existing one-liner positioning + pricing notes per tool.
- **Operations**:
  1. Restructure the source draft into the writer-agent template.
  2. Disambiguate component categories (AI model vs tool vs platform vs code node).
  3. Tabulate free tier vs paid escalation per tool with official links.
- **Primary agent**: `@writer` (Architect objective — workflow part decomposition).
- **Secondary**: `@reviewer` for terminology consistency; `@content-ops` for tag set.
- **Target path**: `content/ai-study-note/<kebab-case>.md` (final folder per taxonomy).
- **DoD**: title set, positioning ≠ pricing confusion eliminated, links verified.

### Issue #75 — Raw/Wiki LLM Knowledge Management
- **Type**: Learn note + framing essay.
- **Inputs**: User-provided 中文說明稿 + Karpathy / 林穎俊 references.
- **Operations**:
  1. Synthesize the two-layer raw/wiki design with explicit role separation.
  2. Capture the IDE + Obsidian + Markdown + Git low-friction stack.
  3. Surface the query-loop write-back behavior as a feedback diagram (candidate for `@diagram`).
- **Primary agent**: `@writer` (Architect objective).
- **Secondary**: `@diagram` if a feedback-loop visualization is added; `@reviewer` final pass.
- **Target path**: `content/learn-notes/<kebab-case>.md` (final per taxonomy).
- **DoD**: clear thesis, raw/wiki value articulated, extension hooks listed.

### Issue #76 — n8n YouTube Automation
- **Type**: Research note + tool taxonomy + PoC sketch (largest scope in queue).
- **Inputs**: YouTube `https://www.youtube.com/watch?v=5Htbfh_LYSE`.
- **Operations**:
  1. Decompose end-to-end workflow (题材→脚本→视觉→音频→组装→发布→监控).
  2. Inventory tools across 6 categories already enumerated in the issue body.
  3. Draft minimal PoC architecture diagram (LR flowchart).
  4. Risk register: copyright, YouTube policy, repetition, cost.
- **Risk**: Scope is broad; if research surfaces >1 deliverable, file sub-issues
  rather than bundling per `cron/git-auto.md` invariants.
- **Primary agent**: `@writer` (Architect objective).
- **Secondary**: `@diagram` for PoC architecture; `@content-ops` for placement.
- **Target path**: `content/research-notes/<kebab-case>.md`.
- **DoD**: workflow + tool taxonomy + ≥1 PoC + risk section.

### Issue #77 — cmux / Terminal Multiplexing for Claude Code
- **Type**: Research note + tool comparison + recommended workflow.
- **Inputs**: 小紅書 link `http://xhslink.com/o/AAbGLpO7BY4`.
- **Operations**:
  1. Resolve `cmux` reference (could be the npm `cmux`, a fork, or a misnomer for tmux/zellij).
  2. Compare against tmux, zellij, WezTerm mux, screen.
  3. Produce a minimum Claude Code workflow (agent pane / logs pane / edit pane / long-task pane).
- **Primary agent**: `@writer` (Architect objective).
- **Secondary**: `@reviewer`; optionally `@diagram` for pane layout sketch.
- **Target path**: `content/research-notes/<kebab-case>.md`.
- **DoD**: identity confirmed, ≥3 tool comparison rows, ≥1 actionable workflow,
  scope limits stated.

## Delegation Matrix

| Issue | Primary | Secondary | Diagram needed | Estimated commits |
|-------|---------|-----------|----------------|-------------------|
| #61 | `@writer` | `@content-ops`, `@reviewer` | No | 1 |
| #74 | `@writer` | `@reviewer`, `@content-ops` | No | 1 |
| #75 | `@writer` | `@diagram` (optional), `@reviewer` | Optional | 1–2 |
| #76 | `@writer` | `@diagram`, `@content-ops` | Yes (LR flow) | 1–2 |
| #77 | `@writer` | `@reviewer` | Optional | 1 |

## Execution Handoff to `cron/git-auto.md`

The cron loop will iterate over the filtered set in ascending issue order:

```
#61 → #74 → #75 → #76 → #77
```

Per-run protocol (from `cron/git-auto.md`):

1. Preflight: `git fetch origin`, working tree clean, `.automation/` is local-only.
2. Pick lowest open issue **from this filtered set**; mark `in_progress` in
   `.automation/issues.json`.
3. Branch fresh: `git checkout -B auto/issue-<n> origin/main`.
4. Invoke the primary agent above; pull in secondary agents as needed.
5. Stage by explicit path; verify with `git diff --cached --stat`.
6. Commit, push, open one PR; record `pr_open` in tracker.
7. Stop. One issue per run.

## Out of Scope for This Triage

- Issue #67 (duplicate page titles) — bug fix; routes through a different lane,
  not the research/writing pipeline.
- Closed issues — not re-evaluated here.
- Sub-issue creation — deferred to the per-issue run if scope expands beyond a
  single PR (per the `cron/git-auto.md` "one issue per branch" invariant).
