# Execution Plan — Research & Writing Issues

> Generated: 2026-04-16
> Workflow: `cron/git-auto.md`
> Processing order: lowest issue number first (one per run)

## Issue Audit Summary

| Total open | Research/Writing | Excluded (non-R&W) |
|------------|-----------------|---------------------|
| 6          | 5               | 1                   |

**Excluded**: #67 (bug fix — duplicate article titles) → not research/writing scope.

---

## Dispatch Queue

### 1. Issue #61 — Research: 自動優化專業級提示詞

| Field | Value |
|-------|-------|
| Type | Research |
| Primary agent | `@writer` |
| Supporting | `@diagram` (workflow visualization) |
| Target path | `content/prompt-notes/` |
| Branch | `auto/issue-61` |

**Operational requirements**:
- Web research to identify the open-source project from the XHS link
- Verify project repo, features, and applicability
- Output: research summary note with 3+ reusable findings
- Post-write: `@reviewer` audit for accuracy and style

---

### 2. Issue #74 — Write: Astron Agent, Serper, Jina AI, Python node, LLM

| Field | Value |
|-------|-------|
| Type | Writing |
| Primary agent | `@writer` |
| Supporting | `@diagram` (workflow component diagram) |
| Target path | `content/claude-code/` |
| Branch | `auto/issue-74` |

**Operational requirements**:
- Synthesize Telegram source material into structured note
- Clarify each tool's role: AI model vs. tool vs. platform vs. logic node
- Include pricing/free-tier summary per tool
- Add workflow diagram showing how components interoperate
- Post-write: `@reviewer` audit; `@content-ops` for taxonomy placement

---

### 3. Issue #75 — Research + Write: LLM Knowledge Management (raw/wiki)

| Field | Value |
|-------|-------|
| Type | Research + Writing |
| Primary agent | `@writer` |
| Supporting | `@diagram` (raw → wiki flow) |
| Target path | `content/prompt-notes/` |
| Branch | `auto/issue-75` |

**Operational requirements**:
- Research references (Karpathy, 林穎俊) for knowledge management patterns
- Document raw/wiki two-layer separation design
- Explain AI-driven summarization and cross-reference workflow
- Include a Mermaid diagram of the raw → wiki → query loop
- Post-write: `@reviewer` audit

---

### 4. Issue #76 — Research: AI YouTube Automation (n8n)

| Field | Value |
|-------|-------|
| Type | Research |
| Primary agent | `@writer` |
| Supporting | `@diagram` (end-to-end pipeline diagram) |
| Target path | `content/claude-code/` |
| Branch | `auto/issue-76` |

**Operational requirements**:
- Analyze the YouTube video for full workflow breakdown
- Categorize 20+ tools across 7 categories (orchestration, LLM, visual, audio, rendering, publishing, storage)
- Assess no-code vs. engineering integration boundaries
- Produce tool comparison table and minimal PoC architecture
- Flag risks: content quality, copyright, YouTube policy
- Post-write: `@reviewer` audit; `@diagram` for pipeline visualization

---

### 5. Issue #77 — Research: Terminal Multiplexing for Claude Code

| Field | Value |
|-------|-------|
| Type | Research |
| Primary agent | `@writer` |
| Supporting | `@diagram` (tool comparison) |
| Target path | `content/claude-code/` |
| Branch | `auto/issue-77` |

**Operational requirements**:
- Trace the XHS post to identify the actual tool (cmux vs. tmux vs. other)
- Compare terminal multiplexers: cmux, tmux, zellij, WezTerm
- Document Claude Code multi-pane workflow patterns
- Produce comparison table and recommended minimal setup
- Post-write: `@reviewer` audit

---

## Agent Pipeline (per issue)

```
@writer (draft) → @diagram (visuals) → @reviewer (QA) → @content-ops (taxonomy)
```

Each issue follows `cron/git-auto.md` invariants:
- One issue per branch, one branch per PR
- Branch from fresh `origin/main`
- Stage files by explicit path only
- `.automation/issues.json` is local state — never committed
- Validate with `npm run quartz -- build` before PR

## Execution Cadence

The `git-auto.md` runner picks the **lowest-numbered pending issue** each run.
Expected processing order: #61 → #74 → #75 → #76 → #77.
