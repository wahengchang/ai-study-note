---
title: Dispatch Manifest — Research & Writing Queue (2026-04-13 / UYtp4)
---

# Dispatch Manifest — Research & Writing Queue

Kickoff artifact for the `cron/git-auto.md` workflow. Audits the open issue queue, filters research/writing tasks, records per-issue operational requirements, and assigns agents from `claude/config.yaml`.

Session branch: `claude/gracious-hawking-UYtp4`
Base: `origin/main @ bc7dd17`

## 1. Audit — open issue queue

| # | Title | Category | Open PR | Disposition |
|---|-------|----------|---------|-------------|
| 61 | Research 小紅書 prompt-optimization OSS | research | #73 | **skip** — in flight |
| 63 | Adopt Mintlify as docs framework | infra / planning | — | **exclude** — framework migration, not a note |
| 67 | Fix duplicate H1 titles | bug fix | — | **exclude** — layout/engineering |
| 74 | Study note: Astron / Serper / Jina / Python / LLM | writing | #121 | **skip** — in flight |
| 75 | Research: raw/wiki LLM knowledge management | research | #120 | **skip** — in flight |
| 76 | Research: n8n AI YouTube automation workflow | research | — | **queue → dispatch** |
| 77 | Research: cmux terminal multiplexing + Claude Code | research | — | **queue → dispatch** |

- Total open: **7**
- Filtered (research/writing): **5**
- Actionable after skipping in-flight PRs: **2** (#76, #77)
- Excluded with reason: **2** (#63, #67)

Dispatch order per `cron/git-auto.md` §4 (lowest open issue first): **#76 → #77**.

## 2. Agent delegation

Drawn from `claude/config.yaml`.

| # | Primary | Support | Rationale |
|---|---------|---------|-----------|
| 76 | `@writer` | `@diagram`, `@reviewer` | Research note + tool taxonomy across 7 workflow stages; LR Mermaid of the pipeline earns its place. Reviewer gates publish. |
| 77 | `@writer` | `@reviewer` | Research note + comparison table + minimal Claude Code workflow. No diagram unless pane layout clarifies more than a list. |

`@writer` is the default authoring role (see `claude/agents/writer.md`). `@diagram` is invoked only when a visualization improves comprehension over prose (per `claude/prompts/mermaid.md`). `@reviewer` runs as the final gate on every publish.

## 3. Operational requirements per issue

### Issue #76 — n8n AI YouTube automation

- **Primary agent**: `@writer`
- **Support**: `@diagram` (LR Mermaid of stage → tool chain), `@reviewer` (final gate)
- **Inputs**:
  - YouTube source: `https://www.youtube.com/watch?v=5Htbfh_LYSE` (ja)
  - Tool list provided in issue across 7 categories (orchestration, LLM/script, visual/video, audio, render, publishing, storage/logging)
- **Discovery cost**: medium — video is in Japanese; per-tool category, cost model, and ja→zh-tw synthesis required
- **Blocking checks**:
  - Source watchable / transcribable
  - Per-tool identity + pricing tier confirmed (mini vs pro, free quota limits)
  - Platform-policy risk review (YouTube bulk upload / repetitive content)
  - Copyright and quality caveats
- **Deliverable shape**:
  - `content/research-notes/n8n-ai-youtube-automation.md` (writer chooses folder against existing taxonomy)
  - Full workflow broken into 7 stages
  - Tool table: name / category / role / pricing / official link
  - ≥1 minimal PoC architecture
  - Risk section: content quality / copyright / YouTube policy / cost
- **Acceptance** (from issue):
  - [ ] Full workflow + tool categorization complete
  - [ ] Per-category tool purpose / strengths / limits
  - [ ] ≥1 actionable PoC
  - [ ] Risks explicitly marked
- **Execution contract** (`cron/git-auto.md`):
  - Branch `auto/issue-76` fresh from `origin/main`
  - Mark `in_progress` in tracker before content work
  - Single commit, explicit-path staging, one PR closing #76

### Issue #77 — cmux + Claude Code terminal workflow

- **Primary agent**: `@writer`
- **Support**: `@reviewer` (final gate); `@diagram` only if pane layout diagram beats prose
- **Inputs**:
  - 小紅書 link: `http://xhslink.com/o/AAbGLpO7BY4`
  - Claim: "this terminal triples Claude Code efficiency" referencing `cmux`
  - Note: issue flags source excerpt is not fully expanded
- **Discovery cost**: medium-high — must first verify what the original post actually refers to as `cmux` (may not be the common `cmux` project); then comparative research against `tmux`, `zellij`, `screen`, WezTerm mux, Warp
- **Blocking checks**:
  - Original tool identity confirmed (project + repo/URL)
  - Category distinction: multiplexer vs session orchestrator vs pane workflow vs Claude Code harness
  - If original tool can't be verified, output must say so explicitly
- **Deliverable shape**:
  - `content/claude-code/terminal-multiplexer-workflow.md`
  - TL;DR on what the 小紅書 post actually refers to
  - Comparison table of ≥3 tools (axes: scope, session model, Claude Code fit, setup cost)
  - Minimal workflow recipe (e.g., agent pane / logs pane / edit-git-test pane / long-running monitor pane)
  - Limits and non-goals section
- **Acceptance** (from issue):
  - [ ] Identity + role of the post's tool confirmed (or explicitly marked unverified)
  - [ ] ≥3 tools / workflows compared
  - [ ] ≥1 concrete Claude Code workflow
  - [ ] Limits and applicable contexts stated
- **Execution contract** (`cron/git-auto.md`):
  - Branch `auto/issue-77` fresh from `origin/main` (after #76 merges or in parallel via separate run)
  - Mark `in_progress` before content work
  - One commit, one PR closing #77

## 4. Shared execution rules

Pulled from `CLAUDE.md` and `claude/prompts/`:

- `kebab-case` for filenames and folders
- Every note has a `title` frontmatter field
- Mermaid `direction LR` only (never `TD`); include a diagram only when visualization adds clarity
- Direct headings, bullets, copy-pasteable code, no fluff
- Obsidian wikilinks where a cross-reference already exists in `content/`
- Do not repeat the frontmatter title as an in-body `# H1` (tracked by #67)

## 5. Invariants honored (this PR)

Per `cron/git-auto.md`:

- `.automation/` not staged; no `git add -A` / `git commit -a`
- Explicit path staging only: `cron/dispatch-2026-04-13-UYtp4.md`
- Working tree was clean; branch is at `origin/main` tip (`bc7dd17`)
- Dispatch-only PR: no `content/` or Quartz config edits bundled
- One PR per concern: this PR dispatches; each queued issue gets its own `auto/issue-<n>` PR on a later run

## 6. Out of scope (excluded with reason)

| # | Why excluded |
|---|--------------|
| 63 | Framework migration (Mintlify) — architectural decision record / follow-up issues, not a research or writing deliverable. Belongs to `@content-ops` planning or a dedicated migration task. |
| 67 | Bug fix — duplicate in-body H1 rendering. Layout/content engineering scope; separately trackable (see existing PR #68 history). |

## 7. Next `cron/git-auto.md` runs

1. **Next run**: pick up #76 → `auto/issue-76` from fresh `origin/main` → `@writer` + `@diagram` → one PR closing #76.
2. **Run after**: pick up #77 → `auto/issue-77` from fresh `origin/main` → `@writer` → one PR closing #77.

Dispatch is complete once both queued issues land merged PRs.
