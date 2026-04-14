# Research & Writing Dispatch — 2026-04-14 (s77GS)

Triage manifest consumed by [`cron/git-auto.md`](./git-auto.md). This document **initiates** the execution workflow — it does not execute issue work itself. `git-auto.md` picks up one issue per run, lowest number first, under its existing invariants.

## Scope

| Filter | Result |
|---|---|
| Open issues scanned | 7 |
| In scope (research / writing) | 5 (#61, #74, #75, #76, #77) |
| Out of scope | 2 (#63 framework RFC, #67 layout bug) |

Agents referenced live under [`claude/agents/`](../claude/agents/) and are registered in [`claude/config.yaml`](../claude/config.yaml).

## Queue

Ordered lowest-number-first (matches `git-auto.md` step 4 selection rule). Issues with an open PR are listed as `SKIP` per the same rule.

| Order | Issue | Title (truncated) | Status | Primary agent | Support | Deliverable |
|---|---|---|---|---|---|---|
| — | [#61](https://github.com/wahengchang/ai-study-note/issues/61) | 研究小紅書：自動優化提示詞開源項目 | SKIP — PR [#73](https://github.com/wahengchang/ai-study-note/pull/73) open | `@writer` | `@reviewer` | Research note on prompt-optimizer repo |
| — | [#74](https://github.com/wahengchang/ai-study-note/issues/74) | Study note: Astron Agent / Serper / Jina / Python node / LLM | SKIP — PR [#121](https://github.com/wahengchang/ai-study-note/pull/121) open | `@writer` | `@reviewer` | Workflow-parts study note |
| — | [#75](https://github.com/wahengchang/ai-study-note/issues/75) | Learn note: LLM-based raw/wiki knowledge management | SKIP — PR [#120](https://github.com/wahengchang/ai-study-note/pull/120) open | `@writer` | `@diagram`, `@reviewer` | Raw→wiki workflow note |
| **1** | [#76](https://github.com/wahengchang/ai-study-note/issues/76) | Research: n8n AI YouTube automation workflow | **READY** | `@writer` | `@diagram`, `@reviewer` | End-to-end pipeline research note + tool matrix + PoC sketch |
| **2** | [#77](https://github.com/wahengchang/ai-study-note/issues/77) | Research: cmux / terminal multiplexing + Claude Code | **READY** | `@writer` | `@reviewer` | Tool identification, comparison table, recommended workflow |

## Operational requirements per ready issue

### #76 — n8n YouTube automation research

- **Primary agent**: `@writer` (composes `formatting.md` + `mermaid.md` + `quartz.md`)
- **Support**: `@diagram` for the end-to-end pipeline visualization (LR orientation); `@reviewer` for final accuracy/style pass
- **Target path**: `content/ai-workflows/n8n-youtube-automation.md` (final placement deferred to `@content-ops` if ambiguous)
- **Must deliver**:
  1. Workflow decomposition (ideation → script → visual → audio → assembly → publish → logging)
  2. Tool inventory grouped by role (orchestration, LLM, visual, audio, rendering, publishing, storage)
  3. Minimum-viable PoC architecture sketch (Mermaid LR)
  4. Risk section: content quality, copyright, duplicate content, YouTube policy
- **Source**: https://www.youtube.com/watch?v=5Htbfh_LYSE
- **Acceptance** (from issue): full workflow mapped, each tool category has use/advantage/limit, ≥1 actionable PoC, explicit risk labeling

### #77 — cmux / terminal multiplexing for Claude Code

- **Primary agent**: `@writer`
- **Support**: `@reviewer` (no diagram required unless a pane-layout visualization adds clarity)
- **Target path**: `content/workflow-notes/terminal-multiplex-claude-code.md` (final placement deferred to `@content-ops` if ambiguous)
- **Must deliver**:
  1. Confirm the tool identity referenced in the 小紅書 post (original link: http://xhslink.com/o/AAbGLpO7BY4)
  2. Comparison of ≥3 tools/workflows (cmux, tmux, zellij, WezTerm mux — pick 3+)
  3. One concrete Claude Code workflow (agent pane / logs pane / edit+git pane / long-running monitor pane)
  4. Applicability and limits section
- **Acceptance** (from issue): tool identity confirmed, ≥3 tools compared, ≥1 Claude Code workflow, explicit applicability/limits

## Out of scope (not research/writing)

- **#63** — Mintlify framework adoption. Infrastructure RFC, not a `content/` note. Already has PR [#124](https://github.com/wahengchang/ai-study-note/pull/124).
- **#67** — Duplicate H1 title layout bug. Quartz theme / frontmatter fix, belongs to `@content-ops` or a layout task, not `@writer`. Already has PR [#68](https://github.com/wahengchang/ai-study-note/pull/68).

## Agent selection rationale

- **`@writer`** owns every ready issue — all deliverables are Markdown notes under `content/`, which is the writer's sole output surface.
- **`@diagram`** is attached only to #76 where a pipeline-flow visualization is load-bearing for reader comprehension. It is **not** invoked on #77 because the content is a tool-comparison matrix where a diagram would add noise.
- **`@reviewer`** runs after every draft for style and accuracy; added to all ready issues.
- **`@content-ops`** is **not** invoked eagerly. Per its own operating principle it stops and asks rather than guessing placement, so the writer proposes a path and only escalates to `@content-ops` if taxonomy placement is ambiguous at intake.

## Execution handoff

`git-auto.md` will pick up #76 on the next run (lowest `READY` number), branch `auto/issue-76` fresh from `origin/main`, and execute under the single-issue-per-run invariant. #77 follows on the subsequent run.
