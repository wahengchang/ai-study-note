# Issue Triage — Research & Writing Queue

> Generated audit of the open issue queue, filtered for research/writing tasks, with agent delegation.
> Execution follows `cron/git-auto.md` — one issue per branch, one branch per PR, lowest number first.

## Audit Summary

- Total open issues: **7**
- Research/writing tasks: **5** — #61, #74, #75, #76, #77
- Excluded: #67 (bug fix), #63 (framework migration / infra)

## Execution Order (per `cron/git-auto.md`)

Lowest number first → **#61 → #74 → #75 → #76 → #77**.

## Delegation Plan

| # | Title (short) | Type | Primary Agent | Supporting | Target Path |
|---|---------------|------|---------------|------------|-------------|
| 61 | 小紅書: auto prompt optimizer OSS | Research | `@writer` | `@reviewer` | `content/research-notes/xhs-prompt-optimizer-oss.md` |
| 74 | Astron Agent / Serper / Jina AI / Python node / LLM | Write | `@writer` | `@diagram`, `@reviewer` | `content/ai-notes/ai-workflow-components-overview.md` |
| 75 | LLM-based knowledge mgmt (raw / wiki workflow) | Research + Note | `@writer` | `@diagram`, `@reviewer` | `content/research-notes/llm-raw-wiki-knowledge-mgmt.md` |
| 76 | n8n AI YouTube automation workflow | Research | `@writer` | `@diagram`, `@reviewer` | `content/research-notes/n8n-youtube-ai-automation.md` |
| 77 | cmux / terminal multiplexing for Claude Code | Research | `@writer` | `@diagram` (optional), `@reviewer` | `content/research-notes/terminal-multiplexing-claude-code.md` |

## Operational Requirements per Issue

### #61 — 小紅書 auto prompt optimizer OSS research
- **Deliverables**: identify source repo, TL;DR (3–5 lines), core features, ≥3 reusable takeaways, fit verdict for `ai-study-note`.
- **Agent**: `@writer` — research summary, no diagram required.
- **Validation**: DoD checklist in the issue body.
- **Risk**: the short-link may not resolve; writer should fall back to heuristic search and flag assumptions with `> [!warning]`.

### #74 — AI workflow components study note
- **Deliverables**: publishable note separating Astron Agent, Serper.dev, Jina AI, Python node, LLM by role + pricing tier + links; closing paragraph framing these as workflow parts, not a single AI tool.
- **Agent**: `@writer` → `@diagram` (LR flowchart of the 5 components in one pipeline) → `@reviewer`.
- **Source**: Telegram-group summary referenced in the issue.

### #75 — LLM raw/wiki knowledge management note
- **Deliverables**: outline/draft explaining raw (immutable) vs wiki (evolving) layers, AI-driven ingestion, query→insight→wiki feedback loop, low-friction IDE+Obsidian+Git implementation.
- **Agent**: `@writer` → `@diagram` (LR: raw → AI ingest → wiki → query → new insight → wiki); `@reviewer` for Karpathy / 林穎俊 attribution accuracy.

### #76 — n8n AI YouTube automation research
- **Deliverables**: workflow breakdown (ideation → script → visuals → audio → assembly → publish → logging), tool inventory by category, PoC architecture sketch, risk section (quality, copyright, YouTube policy).
- **Agent**: `@writer` → `@diagram` (end-to-end LR flowchart, 5–7 nodes) → `@reviewer`.
- **Risk**: tool list is large — reviewer enforces category grouping, not tool-by-tool dump.

### #77 — Terminal multiplexing for Claude Code
- **Deliverables**: identify the actual `cmux` referenced in the xhs post, comparison table (cmux vs tmux vs zellij vs WezTerm mux), ≥1 minimum-viable Claude Code pane workflow.
- **Agent**: `@writer` → `@diagram` optional (pane layout only if it adds clarity) → `@reviewer`.
- **Risk**: xhs link may be opaque; writer flags with `> [!warning]` if identity is inferred.

## Cross-Cutting Rules

- Language: **zh-TW** in line with repo convention for research notes (per `cron/git-auto.md` preamble).
- Frontmatter: `title` required (per `claude/config.yaml` defaults).
- Mermaid: `direction LR` only; skip if it does not add clarity.
- One issue → one branch `auto/issue-<n>` branched from fresh `origin/main` → one PR.
- `.automation/issues.json` is local-only; never stage it.

## Kickoff

This PR initiates the `cron/git-auto.md` loop. The next automation run should:
1. Preflight → clean tree check.
2. Pick **#61** (lowest open research issue).
3. Mark `in_progress` in `.automation/issues.json`.
4. Branch `auto/issue-61` from fresh `origin/main`, delegate to `@writer`, commit, push, open a dedicated PR.
