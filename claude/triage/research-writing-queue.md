---
title: Research and Writing Issue Queue — Triage and Delegation
---

## Context

Audit of the `wahengchang/ai-study-note` open issue queue (as of 2026-04-14), filtered
for **research** and **writing** tasks that produce `content/` notes. Each issue is
analyzed for operational requirements and delegated to the appropriate agent defined
in `claude/config.yaml`. This manifest feeds the `cron/git-auto.md` execution workflow,
which processes one issue per run (lowest number first).

## Filter Criteria

| Include | Exclude |
|---------|---------|
| Study / research / learn notes → `content/` | Bug fixes (template / layout) |
| Tool comparisons, workflow write-ups | Framework migrations / infra |
| Issues labeled `documentation` or `enhancement` with note deliverables | Issues without note deliverables |

## Queue Summary

| Priority | Issue | Type | Agent | Target Path | Status |
|----------|-------|------|-------|-------------|--------|
| 1 | [#61](https://github.com/wahengchang/ai-study-note/issues/61) | Research | `@writer` | `content/prompt-notes/` | ready |
| 2 | [#74](https://github.com/wahengchang/ai-study-note/issues/74) | Writing | `@writer` | `content/ai-workflow/` | ready |
| 3 | [#75](https://github.com/wahengchang/ai-study-note/issues/75) | Research | `@writer` | `content/claude-code/` | ready |
| 4 | [#76](https://github.com/wahengchang/ai-study-note/issues/76) | Research | `@writer` | `content/ai-workflow/` | ready |
| 5 | [#77](https://github.com/wahengchang/ai-study-note/issues/77) | Research | `@writer` | `content/claude-code/` | ready |

**Excluded from this filter:**

- [#67](https://github.com/wahengchang/ai-study-note/issues/67) — Duplicate title bug → `@content-ops` (template/content rule fix, not research/writing)
- [#63](https://github.com/wahengchang/ai-study-note/issues/63) — Mintlify framework adoption → `@content-ops` (infra planning, not note authoring)

## Operational Requirements per Issue

### Issue #61 — 小紅書開源提示詞優化工具研究

- **Deliverable**: research summary note with project identity, TL;DR, core features, applicability.
- **Agent**: `@writer` (compose `formatting.md` + `quartz.md`).
- **Path**: `content/prompt-notes/prompt-optimizer-research.md` (final name TBD by agent).
- **Frontmatter**: `title` required.
- **Key requirements**:
  - Resolve the original 小紅書 link to confirm the actual open-source project.
  - At least 3 reusable takeaways.
  - Conclusion on whether to onboard into `ai-study-note`.
- **Risks**: source link may be inaccessible; escalate with `clarification_needed` if unverifiable.

### Issue #74 — Astron Agent / Serper / Jina AI / Python node / LLM

- **Deliverable**: publishable study note explaining each component's role, pricing, and workflow fit.
- **Agent**: `@writer`.
- **Path**: `content/ai-workflow/astron-serper-jina-workflow-parts.md`.
- **Key requirements**:
  - Classify each as model / tool / platform / logic node.
  - Pricing posture (free tier vs. paid) with official links.
  - Plain-language summary section for non-technical readers.
  - Mermaid diagram (LR) optional — delegate to `@diagram` if included.
- **Risks**: pricing changes fast; mark "as of 2026-04" on claims.

### Issue #75 — LLM Knowledge Management (raw / wiki pattern)

- **Deliverable**: learn note on the two-layer raw/wiki design inspired by Karpathy and 林穎俊.
- **Agent**: `@writer`.
- **Path**: `content/claude-code/llm-raw-wiki-knowledge-management.md`.
- **Key requirements**:
  - Distinguish raw (immutable source) vs. wiki (curated, evolving).
  - Cover IDE + Obsidian + Markdown + Git as low-friction stack.
  - Explain query-back-write loop.
- **Note**: existing `content/claude-code/karpathy-llm-wiki-pattern.md` — confirm no duplication; if overlap, escalate to `@reviewer` for consolidation.

### Issue #76 — n8n AI YouTube Automation Workflow

- **Deliverable**: research note + tool taxonomy + minimal PoC architecture.
- **Agent**: `@writer` (+ `@diagram` for workflow diagram).
- **Path**: `content/ai-workflow/n8n-youtube-automation-research.md`.
- **Key requirements**:
  - End-to-end workflow breakdown (ideation → publishing).
  - Tool categories: orchestration / LLM / visual / audio / render / publishing / storage.
  - Risk notes: content quality, copyright, YouTube policy.
  - Mermaid diagram LR for workflow.

### Issue #77 — cmux / Terminal Multiplexing + Claude Code

- **Deliverable**: research note on terminal multiplexing workflows that boost Claude Code productivity.
- **Agent**: `@writer`.
- **Path**: `content/claude-code/terminal-multiplexing-claude-code.md`.
- **Key requirements**:
  - Verify the original 小紅書 reference to identify actual tool (`cmux` vs. `tmux` vs. other).
  - Compare at least 3 tools (cmux / tmux / zellij / WezTerm mux).
  - Ship one minimal workflow spec.
  - Document applicability and limits.
- **Risks**: ambiguity around `cmux` identity — escalate with `clarification_needed` if the referenced tool cannot be disambiguated.

## Delegation Summary by Agent

| Agent | Issues | Fragments loaded |
|-------|--------|------------------|
| `@writer` | #61, #74, #75, #76, #77 | `formatting.md`, `mermaid.md`, `quartz.md` |
| `@diagram` | #74 (optional), #76 | `mermaid.md` |
| `@reviewer` | Post-draft audit for all | `formatting.md`, `quartz.md` |
| `@content-ops` | (out of scope; handles #63, #67 separately) | `formatting.md`, `quartz.md` |

## Execution Handoff to `cron/git-auto.md`

Per `cron/git-auto.md`:

1. Workflow picks **one** open issue per run, **lowest number first** → first target: **#61**.
2. For the target issue:
   - Branch fresh from `origin/main` as `auto/issue-61`.
   - Execute under the delegated agent (`@writer`) using operational spec above.
   - Stage files by explicit path only; never include `.automation/`.
   - Push, open a single PR, mark `pr_open` in tracker.
3. Subsequent runs process #74 → #75 → #76 → #77 in order.

## Acceptance

- [x] Queue audited, research/writing items filtered.
- [x] Each filtered issue has operational spec (path, agent, requirements, risks).
- [x] Delegation matches the `claude/config.yaml` agent registry.
- [x] Handoff path to `cron/git-auto.md` is explicit.
