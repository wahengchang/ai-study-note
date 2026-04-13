# Dispatch Manifest — Research & Writing Queue

- **Run date**: 2026-04-13
- **Source workflow**: `cron/git-auto.md`
- **Scope**: Open issues filtered to research + writing work
- **Language**: zh-tw (per `cron/git-auto.md`)

## Filter criteria

- State: `OPEN`
- Type: research note, study note, research-driven writing
- Excluded: pure bug fixes, UI/layout fixes, infra-only work

## Audit results

Total open issues scanned: **7** (`#61, #63, #67, #74, #75, #76, #77`).

### In scope (research/writing)

| Issue | Title | Agent | PR status | Action this run |
|-------|-------|-------|-----------|-----------------|
| [#61](https://github.com/wahengchang/ai-study-note/issues/61) | 研究小紅書：寶藏開源項目，自動優化專業級提示詞 | `@writer` | Open: [#73](https://github.com/wahengchang/ai-study-note/pull/73) `auto/issue-61` | **Skip** — PR in flight |
| [#63](https://github.com/wahengchang/ai-study-note/issues/63) | Adopt Mintlify as new framework for ai-study-note docs site | `@content-ops` | None | **Dispatch next** (lowest unblocked) |
| [#74](https://github.com/wahengchang/ai-study-note/issues/74) | Write study note on Astron Agent, Serper, Jina AI, Python node, and LLM | `@writer` | Open: [#121](https://github.com/wahengchang/ai-study-note/pull/121) `auto/issue-74` | **Skip** — PR in flight |
| [#75](https://github.com/wahengchang/ai-study-note/issues/75) | Research learn note on LLM-based knowledge management with raw and wiki workflow | `@writer` | Open: [#120](https://github.com/wahengchang/ai-study-note/pull/120) | **Skip** — PR in flight |
| [#76](https://github.com/wahengchang/ai-study-note/issues/76) | Research AI-powered YouTube automation workflow from n8n video | `@writer` + `@diagram` | None | Queue after #63 |
| [#77](https://github.com/wahengchang/ai-study-note/issues/77) | Research terminal multiplexing workflow (cmux) for Claude Code | `@writer` | None | Queue after #76 |

### Out of scope

| Issue | Reason |
|-------|--------|
| [#67](https://github.com/wahengchang/ai-study-note/issues/67) | Bug fix — duplicate H1 titles; tracked by PR [#68](https://github.com/wahengchang/ai-study-note/pull/68) `auto/issue-67`. Not a research/writing task. |

## Operational requirements per issue

### #61 — 小紅書 prompt optimizer research (`@writer`, SKIP)
- Output: research note under `content/` summarizing repo, TL;DR, 3+ reusable takeaways.
- Needs: source URL trace, candidate repo identification.
- Gate: PR [#73](https://github.com/wahengchang/ai-study-note/pull/73) already covers it.

### #63 — Mintlify framework adoption (`@content-ops`, **DISPATCH**)
- Output: decision-record note + follow-up migration task.
- Needs:
  - Confirm Mintlify fit vs. current Quartz stack (Preact + esbuild).
  - Document tech stack deltas (Next.js/MDX/Tailwind vs. Quartz plugins).
  - Produce an explicit follow-up issue for the actual rebuild (do **not** migrate in this branch).
- Acceptance: single markdown note + a filed follow-up issue referencing it.
- Why `@content-ops`: scope is framework evaluation and planning artefacts, not authoring a technical study note. Writer is backup if pure prose is preferred.

### #74 — AI workflow components study note (`@writer`, SKIP)
- Output: zh-tw article clarifying roles of Astron Agent / Serper / Jina / Python node / LLM.
- Gate: PR [#121](https://github.com/wahengchang/ai-study-note/pull/121) already covers it.

### #75 — Raw/Wiki LLM knowledge management (`@writer`, SKIP)
- Output: study note on raw-vs-wiki two-layer design, referencing Karpathy + 林穎俊老師.
- Gate: PR [#120](https://github.com/wahengchang/ai-study-note/pull/120) already covers it.

### #76 — n8n YouTube automation workflow (`@writer` + `@diagram`, queued)
- Output: research note + tool inventory + minimal PoC sketch + Mermaid LR workflow.
- Needs: end-to-end workflow decomposition, tool categorization (orchestration / LLM / visual / audio / rendering / publishing / storage), risk section (copyright, YouTube policy).
- Why `@diagram`: LR Mermaid needed for the workflow overview; writer composes, diagram reviews.

### #77 — cmux / terminal multiplexing for Claude Code (`@writer`, queued)
- Output: research note comparing cmux / tmux / zellij / WezTerm mux for Claude Code pane workflow.
- Needs: source trace (original 小紅書 link), 3+ tool comparison, 1 concrete minimal workflow.

## This run's action

Per `cron/git-auto.md` ("pick one open issue per run, lowest number first, skip issues with open PRs"):

- **Next issue for execution**: **#63 — Mintlify framework adoption**.
- **Assigned agent**: `@content-ops`.
- **Next branch**: `auto/issue-63` (branched fresh from `origin/main` on the subsequent run).

This PR itself is a dispatch manifest — it does **not** implement #63. The next `git-auto` run will pick up #63, branch `auto/issue-63` from `origin/main`, and produce the evaluation note + follow-up issue.

## Guardrails honoured

- `.automation/` not staged (none exists).
- No `git add -A` / `git commit -a` used.
- Working tree clean before branching.
- Branch cut from fresh `origin/main`.
- Manifest only — no content under `content/` touched.
