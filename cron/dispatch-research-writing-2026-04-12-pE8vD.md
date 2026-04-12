# Dispatch — Research & Writing Issue Queue (2026-04-12)

Execution brief for `cron/git-auto.md`. Filters the open issue queue to research
and writing work, assigns agents from `claude/config.yaml`, and records
per-issue operational requirements so each `auto/issue-<n>` run has a clean
starting contract.

## Scope filter

Included: issues whose deliverable is a research note or a study note.
Excluded: bug fixes, layout/infra, or framework migration work.

| # | Title | Category | Open PR? | Disposition |
|---|-------|----------|----------|-------------|
| 77 | `cmux` terminal multiplexing × Claude Code productivity | research | — | queued → `@writer` + `@diagram` (gate `@reviewer`) |
| 76 | n8n AI-powered YouTube automation workflow | research | — | queued → `@writer` + `@diagram` (gate `@reviewer`) |
| 75 | LLM-based knowledge management (raw / wiki two-layer) | research / writing | — | queued → `@writer` + `@diagram` (gate `@reviewer`) |
| 74 | Astron Agent / Serper / Jina / Python node / LLM study note | writing | #103 | skip — PR open, tracked |
| 67 | Remove duplicate H1 titles | bug fix | — | excluded — layout/content engineering |
| 63 | Adopt Mintlify documentation framework | infra / planning | — | excluded — not a note deliverable |
| 61 | Prompt-optimization OSS project (小紅書 source) | research | #73 | skip — PR open, tracked |

Actionable dispatch order for `cron/git-auto.md` (lowest-first, skipping
issues with an open PR): **75 → 76 → 77**.

## Per-issue operational requirements

### Issue #75 — LLM-based knowledge management (raw / wiki)

- **Primary agent**: `@writer`
- **Support**: `@diagram` (two-layer flow), `@reviewer` (publish gate)
- **Inputs**:
  - User's Chinese prose brief (from the issue body).
  - Karpathy-style LLM-maintained wiki references.
  - 林穎俊 老師 workflow references.
- **Blocking checks**: do not duplicate `content/research-notes/` entries
  that already cover Karpathy wiki (see commit `bc7dd17`); cross-link
  instead.
- **Deliverable shape**:
  - Single note under `content/research-notes/` (kebab-case).
  - Frontmatter `title` (zh-tw).
  - Sections: 核心設計 / raw 與 wiki 分工 / AI 整理流程 / 查詢回寫 /
    實作建議 (IDE + Obsidian + Markdown + Git) / 限制與風險.
  - One Mermaid `direction LR` flow: raw → AI 整理 → wiki → 查詢 → 回寫.
  - Bullet-first, copy-pasteable; no fluff.
- **Acceptance**: raw/wiki roles clearly split; workflow rationale stated;
  at least one実作建議 落地路徑.

### Issue #76 — n8n AI YouTube automation workflow

- **Primary agent**: `@writer`
- **Support**: `@diagram` (pipeline overview), `@reviewer` (publish gate)
- **Inputs**:
  - YouTube: https://www.youtube.com/watch?v=5Htbfh_LYSE
  - Tool shortlist already enumerated in the issue (n8n, Fal, Kling,
    Veo3, Suno, json2video, Blotato, etc.).
- **Blocking checks**: confirm tool identity and pricing tier before
  asserting "免費 / 付費"; flag items unavailable in zh-tw markets.
- **Deliverable shape**:
  - Single note under `content/research-notes/` (kebab-case).
  - Frontmatter `title`.
  - Sections: Workflow 拆解 / 工具盤點（依類別分組表格） /
    成本與風險 / PoC 最小可行架構 / 延伸到研究型內容自動化.
  - One Mermaid `direction LR` end-to-end pipeline.
  - Comparison table grouped by stage (orchestration / LLM / visual /
    audio / assembly / publishing / logging).
- **Acceptance**: end-to-end workflow mapped; 工具分類清單 complete;
  ≥1 PoC 落地方案; risks (版權 / 政策 / 品質) explicit.

### Issue #77 — cmux terminal multiplexing × Claude Code

- **Primary agent**: `@writer`
- **Support**: `@diagram` (pane layout), `@reviewer` (publish gate)
- **Inputs**:
  - 小紅書 source: http://xhslink.com/o/AAbGLpO7BY4 (resolve the
    actual project referenced; verify name disambiguation — common
    `cmux` vs Rust/Go ports vs other tooling).
- **Blocking checks**: if the source cannot be unambiguously resolved,
  leave an issue comment, set `clarification_needed`, and stop per
  `cron/git-auto.md` step 4.
- **Deliverable shape**:
  - Single note under `content/research-notes/` (kebab-case).
  - Frontmatter `title`.
  - Sections: 原文追溯 / 工具身份確認 / cmux vs tmux / zellij /
    WezTerm mux 比較 / Claude Code 多 pane 工作流實作 / 限制.
  - Comparison table.
  - One Mermaid `direction LR` pane-orchestration diagram.
- **Acceptance**: source tool identified; ≥3 comparable tools reviewed;
  ≥1 concrete Claude Code workflow (agent pane / logs pane / edit+git
  pane / long-running monitor pane); limits stated.

## Shared execution rules (inherited from `CLAUDE.md`)

- File naming: `kebab-case` for all new notes and folders.
- Frontmatter: every note must include `title`.
- Language: zh-tw for note prose per `cron/git-auto.md` invariant.
- Markdown: bullets first, copy-pasteable code blocks, direct headings.
- Mermaid: `direction LR` only; never `TD`; include only when a diagram
  adds clarity.
- Terminology: prefer precise domain terms.
- No duplicate in-body H1 when frontmatter `title` is present
  (see open issue #67 for pattern — avoid reintroducing).

## Execution contract with `cron/git-auto.md`

For each dispatched issue (75 → 76 → 77):

1. Preflight: `git fetch origin`, clean working tree, ignore
   `.automation/` paths.
2. Mark tracker `in_progress` before work starts.
3. Branch fresh: `git checkout -B auto/issue-<n> origin/main`.
4. Implement a single note (plus any supporting asset strictly required).
5. Stage files by explicit path; verify `git diff --cached --stat`
   contains no `.automation/` entries.
6. `npm run check` must pass before push.
7. One commit, one push, one PR, one issue closed per run.
8. On validation failure mark `failed`; on success mark `pr_open`.

## Out of scope for this PR

- This PR is metadata only — no `content/` changes.
- Bug fix (#67) and framework migration (#63) remain tracked but are
  not part of the research/writing execution stream.
- Open PRs #73 (closes #61) and #103 (addresses #74) stay with their
  existing branches; this dispatch does not reopen or rebase them.
