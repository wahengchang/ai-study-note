# Research & Writing Queue — Dispatch Plan

> Audit snapshot: 2026-04-14 · Triggers [`cron/git-auto.md`](./git-auto.md) execution workflow.

## Filter Criteria

Open issues classified as **research** or **writing** deliverables bound for `content/`. Excludes engineering, layout, framework-migration, and infra work.

## Audit Summary

| Metric | Count |
|---|---|
| Open issues scanned | 7 |
| Filtered (research/writing) | 5 |
| Excluded (engineering/infra) | 2 |

**Excluded** — out of scope for this dispatch:
- `wahengchang/ai-study-note#67` — duplicate title bug → layout/template fix → `@content-ops` (separate run)
- `wahengchang/ai-study-note#63` — Mintlify framework adoption → infra migration planning → engineering queue

## Dispatch Table

Processed lowest-number first per [`cron/git-auto.md`](./git-auto.md) §4. One issue per run, one branch per PR.

| # | Issue | Agent | Type | Deliverable | Branch |
|---|---|---|---|---|---|
| 1 | `#61` | `@writer` | Research | Open-source prompt-optimizer study note + 3+ reusable takeaways | `auto/issue-61` |
| 2 | `#74` | `@writer` | Writing | Astron Agent / Serper / Jina AI / Python node / LLM workflow note | `auto/issue-74` |
| 3 | `#75` | `@writer` | Research | LLM knowledge-management note (raw/wiki two-layer design) | `auto/issue-75` |
| 4 | `#76` | `@writer` | Research | n8n AI YouTube automation workflow note + tool-category map + PoC | `auto/issue-76` |
| 5 | `#77` | `@writer` | Research | Terminal-multiplexer × Claude Code workflow note + comparison table | `auto/issue-77` |

## Operational Requirements Per Issue

### `#61` — 寶藏開源項目（prompt optimizer）
- **Agent**: `@writer` (composes `formatting.md`, `mermaid.md`, `quartz.md`)
- **Source verification**: Resolve Xiaohongshu link `http://xhslink.com/o/7iAalKtM6SX`; confirm project repo identity before writing.
- **Output path**: `content/prompt-notes/<kebab-case-slug>.md`
- **Definition of Done**: Source confirmed · 3+ reusable points · TL;DR (3–5 lines) · adoption-fit conclusion.
- **Risk**: Unverifiable source → mark `clarification_needed` per git-auto §4.

### `#74` — Astron Agent / Serper / Jina AI / Python node / LLM
- **Agent**: `@writer` — writing-heavy, source material already supplied.
- **Output path**: `content/<tool-or-workflow-topic>/<kebab-case-slug>.md` (folder chosen via `docs/content-taxonomy.md` decision tree).
- **Constraints**: Plain-language register; separate "usually free" vs. "pay-to-scale" table; retain official links.
- **Definition of Done**: Title + publishable draft · each tool's role & pricing non-ambiguous · frames the diagram as workflow parts, not a single AI tool.

### `#75` — LLM knowledge management (raw/wiki)
- **Agent**: `@writer`
- **Output path**: `content/<knowledge-mgmt-topic>/<kebab-case-slug>.md`
- **Constraints**: Separate raw (immutable source) vs. wiki (evolving knowledge) layers; reference Andrej Karpathy & 林穎俊 framing; IDE + Obsidian + Markdown + Git stack.
- **Definition of Done**: Outline/first draft · raw↔wiki value articulated · extension hooks for queries, content output, brainstorming.

### `#76` — n8n AI YouTube automation
- **Agent**: `@writer`
- **Output path**: `content/<workflow-automation-topic>/<kebab-case-slug>.md`
- **Scope**: End-to-end workflow decomposition · tool inventory by category (orchestration / LLM / visual / audio / render / publish / storage) · PoC architecture · risk register (quality, copyright, YouTube policy).
- **Definition of Done**: Full workflow + per-category tool table · ≥1 landable PoC · explicit risk annotations.

### `#77` — cmux / terminal multiplexing × Claude Code
- **Agent**: `@writer`
- **Output path**: `content/claude-code/<kebab-case-slug>.md`
- **Scope**: Disambiguate `cmux` reference from Xiaohongshu source · compare with `tmux`, `zellij`, `screen`, WezTerm mux · pane-layout patterns for agent / logs / edit-git-test / long-running monitoring.
- **Definition of Done**: Source tool identified · ≥3 comparable tools · ≥1 actionable minimal workflow · explicit fit/limits.

## Execution Contract (per `cron/git-auto.md`)

- Pick lowest-number open issue; skip any already `in_progress` or with an open PR.
- Branch fresh from `origin/main` as `auto/issue-<n>`; never reuse stale local branches.
- Stage files by explicit path only — never `git add .` / `-A`; never stage `.automation/`.
- One issue per run · one branch per PR · no empty commits.
- On validation failure: mark `failed` in tracker; do not ship.

## Agent Skill-Set Rationale

| Skill | Agent | Why |
|---|---|---|
| Evidence-based technical note authoring | `@writer` | All 5 issues converge on `content/` Markdown deliverables with Quartz frontmatter and domain-precise terminology. |
| Post-draft QA | `@reviewer` | Optional follow-up pass per note before PR merge; not dispatched in this run. |
| File placement / taxonomy | `@content-ops` | Invoked only if `@writer` hits an ambiguous folder decision per `docs/content-taxonomy.md`. |
