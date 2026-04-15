# Issue Queue — Research & Writing

> Seed brief for `cron/git-auto.md`. Lists open issues filtered to research/writing scope, their operational requirements, and the delegated agent. One issue per run, lowest number first, per the invariants in `cron/git-auto.md`.

## Audit Snapshot

- Source: `wahengchang/ai-study-note` open issues
- Filter: research notes and writing notes only
- Excluded: layout/bug/content-ops tasks (tracked separately)

| # | Title | Agent | Status |
|---|---|---|---|
| 61 | (Research) 小紅書：自動優化專業級提示詞開源項目 | `@writer` | queued |
| 74 | Write study note on Astron Agent, Serper, Jina AI, Python node, LLM | `@writer` | queued |
| 75 | Research learn note on LLM-based knowledge management (raw/wiki) | `@writer` | queued |
| 76 | Research AI-powered YouTube automation workflow (n8n) | `@writer` + `@diagram` | queued |
| 77 | Research terminal multiplexing workflow for Claude Code (cmux) | `@writer` | queued |

**Excluded from this queue**

| # | Title | Reason |
|---|---|---|
| 67 | Fix duplicate article titles on ai-study-note pages | Layout/template fix — route to `@content-ops` in a separate queue |

## Processing Order

Per `cron/git-auto.md` step 4: lowest number first, skip `in_progress`, skip if PR already open. Execution order: **61 → 74 → 75 → 76 → 77**.

---

## Operational Requirements

### #61 — 小紅書開源項目（自動優化提示詞）

- **Agent**: `@writer`
- **Intent class**: Research (Architect-leaning)
- **Source material**: `http://xhslink.com/o/7iAalKtM6SX`
- **Operational requirements**
  - Identify the actual open-source project referenced in the post (name, repo, docs).
  - Capture TL;DR (3–5 lines), core features, usage surface, suitable scenarios.
  - Extract 3+ reusable takeaways; conclude whether it merits follow-up notes.
- **Output target**: `content/ai-tool-notes/<kebab-case>.md`
- **Frontmatter**: `title` required.
- **DoD mapping**
  - [ ] Source project confirmed with link
  - [ ] Research summary written
  - [ ] ≥3 reusable takeaways
  - [ ] Conclusion on inclusion in `ai-study-note`

### #74 — Astron Agent, Serper, Jina AI, Python node, LLM

- **Agent**: `@writer`
- **Intent class**: Architect (workflow component breakdown)
- **Source material**: User-provided Telegram note (role/pricing/link per tool)
- **Operational requirements**
  - For each component: what it does, category (model / tool / platform / logic node), free tier or pricing model, official link.
  - Explain how the pieces compose into one AI workflow — emphasize they are parts, not substitutes.
  - Keep a plain-language layer for non-technical readers.
  - Optional section: "free to start vs. typically paid at scale".
- **Output target**: `content/ai-workflow-notes/astron-serper-jina-python-llm.md`
- **Out of scope**: deep implementation tutorial, full alternatives matrix.

### #75 — LLM-based knowledge management (raw / wiki)

- **Agent**: `@writer`
- **Intent class**: Architect
- **Source material**: User's write-up + Andrej Karpathy / 林穎俊 references; FB share link
- **Operational requirements**
  - Explain the raw / wiki two-layer separation (raw = immutable source, wiki = evolving knowledge).
  - Cover: AI-assisted structuring, summary + taxonomy + cross-links, query → writeback loop.
  - Ground the implementation in IDE + Obsidian + Markdown + Git (low-friction stack).
  - Frame the value for personal knowledge management; note limits (not production-grade).
- **Output target**: `content/knowledge-management/llm-raw-wiki-workflow.md`
- **Optional**: LR Mermaid diagram of the raw → wiki → query loop.

### #76 — AI YouTube automation (n8n)

- **Agents**: `@writer` (primary), `@diagram` (workflow diagram)
- **Intent class**: Architect + Research
- **Source material**: YouTube video `5Htbfh_LYSE`
- **Operational requirements**
  - Decompose end-to-end workflow: ideation → script → visuals → audio → assembly → publish → telemetry.
  - Tool inventory grouped by role (Orchestration, LLM, Visual, Audio, Render, Publishing, Storage/Logging).
  - Note: which steps are truly no-code vs. need engineering glue; API cost structure; zh-TW workflow viability.
  - Deliver a minimal PoC architecture sketch.
  - Call out risks: content quality, copyright, duplicate-content, YouTube policy.
- **Output target**: `content/ai-workflow-notes/n8n-youtube-automation.md`
- **Diagram requirement**: Mermaid `direction LR`, workflow stages as nodes.

### #77 — Terminal multiplexing for Claude Code (cmux)

- **Agent**: `@writer`
- **Intent class**: Optimize (workflow productivity)
- **Source material**: `http://xhslink.com/o/AAbGLpO7BY4`
- **Operational requirements**
  - Confirm the actual tool the post references (cmux vs. tmux vs. zellij vs. WezTerm mux).
  - Compare ≥3 tools in a table (scope, session model, AI-agent fit).
  - Document pane/session patterns for Claude Code: agent pane, logs pane, edit/git/test pane, long-running monitor pane.
  - Deliver one minimal, adoptable workflow recipe.
- **Output target**: `content/claude-code-notes/terminal-multiplexing-workflow.md`
- **Comparison table required** (Smart Columns or standard Markdown table).

---

## Execution Contract

For each run, `cron/git-auto.md` MUST:

1. Preflight (`git fetch`, clean tree, branch from fresh `origin/main`).
2. Pick the lowest-numbered queued issue not already `in_progress` / `pr_open`.
3. Load the matching entry above for operational requirements.
4. Delegate to the listed agent (compose its prompt fragments per `claude/config.yaml`).
5. Write the note at the listed output target, respecting:
   - `kebab-case` filenames
   - `title` frontmatter
   - Mermaid `direction LR` only
   - `npm run quartz -- build` must exit 0
6. Stage by explicit path only. Never touch `.automation/`.
7. One issue → one branch (`auto/issue-<n>`) → one PR.

## Agent Assignment Summary

| Agent | Issues | Rationale |
|---|---|---|
| `@writer` | 61, 74, 75, 76, 77 | All five require authoring a Quartz note; writer owns `formatting + mermaid + quartz` prompt composition. |
| `@diagram` | 76 | Workflow decomposition benefits from a Mermaid LR pipeline diagram. |
| `@reviewer` | (post-draft, any) | Run after writer completes a draft; gate on BLOCK severity before PR merge. |
| `@content-ops` | — | Not used for this queue; reserved for #67 and similar maintenance tasks. |
