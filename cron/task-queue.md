# Research & Writing Dispatch Queue

> Initiates the execution workflow defined in [`cron/git-auto.md`](./git-auto.md).
> Audit date: **2026-04-13** · Source: open issues on `wahengchang/ai-study-note`.

## Audit summary

- **Open issues scanned**: 7
- **Filtered to research/writing**: 6 (`#61`, `#63`, `#74`, `#75`, `#76`, `#77`)
- **Excluded**: `#67` — layout bug (duplicate page titles); routes to a frontend/template fix, not a content task.

## Filtered queue

Sorted by issue number ascending — `cron/git-auto.md` rule: "Pick one open issue to work on per run (lowest number first)."

| # | Issue | Deliverable | Type | Primary | Supporting | Open PR? | Status |
|---|---|---|---|---|---|---|---|
| 1 | [#61](https://github.com/wahengchang/ai-study-note/issues/61) — 小紅書 prompt auto-optimizer | Research summary + adoption verdict | research | `@writer` | `@reviewer` | — | **ready** |
| 2 | [#63](https://github.com/wahengchang/ai-study-note/issues/63) — Mintlify framework adoption | Framework evaluation note | research | `@writer` | `@reviewer` | #124 | skip — PR open |
| 3 | [#74](https://github.com/wahengchang/ai-study-note/issues/74) — Astron / Serper / Jina / Python / LLM | Workflow-parts study note | write | `@writer` | `@reviewer` | #121, #103 | skip — PR open |
| 4 | [#75](https://github.com/wahengchang/ai-study-note/issues/75) — Raw/Wiki LLM knowledge management | Learn note + LR diagram | research + write | `@writer` | `@diagram`, `@reviewer` | #120 | skip — PR open |
| 5 | [#76](https://github.com/wahengchang/ai-study-note/issues/76) — n8n AI YouTube automation | Workflow research + tool taxonomy + PoC sketch | research | `@writer` | `@diagram`, `@reviewer` | — | **ready** |
| 6 | [#77](https://github.com/wahengchang/ai-study-note/issues/77) — cmux / terminal multiplexing | Tool comparison + Claude Code workflow | research | `@writer` | `@reviewer` | — | **ready** |

## Operational requirements per issue

### #61 — Prompt auto-optimizer research (`@writer` → `@reviewer`)
- **Primary work**: identify the opensource project from the 小紅書 link, summarize its purpose, core features, and applicability.
- **Inputs**: `http://xhslink.com/o/7iAalKtM6SX` (already linked in issue), 1 prior comment.
- **Output path**: `content/research-notes/<kebab-case-project>.md` (final placement TBD by `@writer` per project name once identified).
- **Acceptance** (per issue): repo confirmed, TL;DR (3–5 lines), 3+ reusable bullets, recommendation on inclusion.
- **Diagram?** No — text summary only.

### #63 — Mintlify framework evaluation (`@writer` → `@reviewer`) — SKIP
- Already covered by open PR #124. No new branch.

### #74 — AI workflow parts study note (`@writer` → `@reviewer`) — SKIP
- Already covered by open PRs #121 and #103. Track the active one; do not re-dispatch.

### #75 — Raw/Wiki LLM knowledge management (`@writer` → `@diagram` → `@reviewer`) — SKIP
- Already covered by open PR #120.

### #76 — n8n AI YouTube automation (`@writer` → `@diagram` → `@reviewer`)
- **Primary work**: decompose the end-to-end workflow from the source video; classify tools by stage (orchestration / LLM / visual / audio / render / publish / ops); produce minimum-viable PoC sketch and risk register (cost, copyright, YouTube policy).
- **Output path**: `content/research-notes/n8n-ai-youtube-automation.md`.
- **Diagram requirement**: one `flowchart LR` showing topic → script → visuals → audio → render → publish → analytics; nodes labeled with tool category, not vendor lock-in.
- **Acceptance** (per issue): full workflow + tool classification, per-class pros/cons, ≥1 PoC plan, explicit risk callout.

### #77 — cmux / terminal multiplexing for Claude Code (`@writer` → `@reviewer`)
- **Primary work**: confirm what `cmux` actually refers to (vs. `tmux`, `zellij`, WezTerm mux); compare ≥3 multiplexer/workflow tools; produce minimal Claude Code pane layout recommendation.
- **Output path**: `content/research-notes/terminal-multiplexing-claude-code.md`.
- **Diagram?** Optional — a 4-pane layout sketch can be a fenced ASCII block or omitted; do not force Mermaid.
- **Acceptance** (per issue): tool identity confirmed, 3+ tools compared, 1 actionable workflow, applicability + limitations stated.

## Agent rationale

- **`@writer` is primary on every queued item.** All deliverables are publishable Quartz notes under `content/`; `claude/agents/writer.md` is the right composer.
- **`@reviewer` is the final gate** for structure, accuracy, style, and Quartz build. Required on every item before merge.
- **`@diagram` attached only to #76** because the YouTube automation workflow benefits from a single LR flowchart. #75 (skipped) would also use it.
- **`@content-ops` not invoked here.** Each issue already specifies its target folder/topic; no taxonomy arbitration is needed at dispatch time. If `@writer` discovers ambiguous placement (e.g., `research-notes/` vs `prompt-notes/`), escalate to `@content-ops` then.

## Excluded from this queue

| # | Issue | Reason | Suggested route |
|---|---|---|---|
| #67 | Duplicate article titles on Quartz pages | Layout/template bug, not research/writing | Frontend fix on `quartz/components/` + `@content-ops` audit for in-body H1 duplicates |

## Next execution (per `cron/git-auto.md`)

The next `git-auto` run picks **#61** — lowest-numbered ready issue.

```
git fetch origin
git checkout -B auto/issue-61 origin/main
# @writer drafts content/research-notes/<project>.md
# @reviewer audits per claude/agents/reviewer.md
git add <explicit paths>
git commit -m "feat: 新增 ... 研究筆記 (closes #61)"
git push -u origin auto/issue-61
# open one PR, mark issue pr_open
```

Invariants from `cron/git-auto.md` that must hold for that run:

- Branch fresh from `origin/main`, never reuse stale local state.
- One issue per branch, one branch per PR.
- Stage by explicit path; never `git add .` or `git add -A`.
- Verify `git diff --cached --stat` includes no `.automation/` or unrelated paths before commit.
- On validation failure, mark the issue `failed` in the tracker and stop — do not bundle a fix.
