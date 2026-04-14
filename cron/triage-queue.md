# Issue Triage Queue — Research & Writing

Generated: 2026-04-14
Source: open issues on `wahengchang/ai-study-note`
Filter: research / writing tasks only
Execution workflow: [./git-auto.md](./git-auto.md)

## Summary

| # | Title | Class | Agent | Priority |
|---|-------|-------|-------|----------|
| 61 | 小紅書 prompt-optimization OSS research | research | `@writer` | P1 (lowest open) |
| 74 | Astron Agent / Serper / Jina AI / Python node / LLM study note | writing | `@writer` | P2 |
| 75 | LLM knowledge management (raw + wiki) learn note | research + writing | `@writer` | P3 |
| 76 | n8n AI-powered YouTube automation research note | research + writing | `@writer` | P4 |
| 77 | cmux terminal multiplexing for Claude Code productivity | research + writing | `@writer` | P5 |

### Out of scope (this triage)

| # | Title | Reason | Suggested agent |
|---|-------|--------|-----------------|
| 63 | Adopt Mintlify as new framework | Infra/architecture evaluation, not research/writing | engineering / `@content-ops` (deferred) |
| 67 | Fix duplicate article titles | Template / content-ops bug fix | `@content-ops` (deferred) |

## Execution order

Per `cron/git-auto.md` invariant — one issue per branch, one PR per branch, **lowest issue number first**:

```
#61 → #74 → #75 → #76 → #77
```

Each run of `git-auto.md` picks exactly **one** issue, branches `auto/issue-<n>` from fresh `origin/main`, and opens a dedicated PR.

---

## Operational requirements

### Issue #61 — 小紅書 prompt-optimization OSS (P1)

- **Agent**: `@writer`
- **Skill set**: source triage, repo identification, TL;DR + bullet summary
- **Inputs**: Xiaohongshu link `http://xhslink.com/o/7iAalKtM6SX`
- **Deliverables**
  - Confirm upstream repo / author
  - TL;DR (3–5 lines)
  - Core features list
  - 3 reusable takeaways
  - Recommendation: fit for `content/` inclusion (yes / no + why)
- **Target location**: `content/research-notes/prompt-optimization-oss.md`
- **Frontmatter**: `title` required (per CLAUDE.md writing rules)
- **Definition of done**: acceptance checklist in issue body

### Issue #74 — Astron Agent / Serper / Jina / Python node / LLM (P2)

- **Agent**: `@writer`
- **Skill set**: workflow decomposition, pricing table, plain-language explainer
- **Inputs**: Telegram source snippet (already curated by user)
- **Deliverables**
  - Article title + outline + first draft
  - Per-tool one-liner, role classification (model / tool / platform / code node)
  - Free-tier vs paid summary with links
  - Closing paragraph framing the diagram as "workflow parts, not a single AI tool"
- **Target location**: `content/ai-workflow/astron-serper-jina-python-llm.md`
- **Audience**: non-technical reader, keep one plain-language pass
- **Scope guard**: no deep implementation tutorial; alternatives list only as "further reading"

### Issue #75 — LLM knowledge management, raw + wiki (P3)

- **Agent**: `@writer`
- **Skill set**: concept synthesis, comparison framing, outline-first drafting
- **Inputs**: user-provided Chinese write-up; references to Andrej Karpathy and 林穎俊
- **Deliverables**
  - Learn-note outline or first draft
  - Explicit role separation: raw layer (immutable) vs wiki layer (evolving)
  - Why this suits personal KM
  - Query → writeback loop explanation
- **Target location**: `content/learn-notes/llm-raw-wiki-knowledge-management.md`
- **Scope guard**: no production architecture; no exhaustive tool comparison
- **Stack assumption**: IDE + Obsidian + Markdown + Git (low-friction baseline)

### Issue #76 — n8n AI-powered YouTube automation (P4)

- **Agent**: `@writer`
- **Skill set**: end-to-end workflow breakdown, tool inventory, PoC sketch, risk analysis
- **Inputs**: YouTube reference `https://www.youtube.com/watch?v=5Htbfh_LYSE`
- **Deliverables**
  - Workflow breakdown (ideation → script → visuals → audio → assembly → publish → logging)
  - Tool inventory by category (orchestration, LLM, visual, audio, rendering, publish, storage)
  - Minimum viable PoC architecture sketch
  - Risk section: content quality, copyright, duplicate content, YouTube policy
  - Commentary on zh-TW suitability and research-content (vs short-form farm) reframe
- **Target location**: `content/ai-workflow/n8n-youtube-automation.md`
- **Diagram**: consider a Mermaid `direction LR` flow (delegate to `@diagram` if needed)

### Issue #77 — cmux terminal multiplexing for Claude Code (P5)

- **Agent**: `@writer`
- **Skill set**: source verification, comparative tooling analysis, practical workflow design
- **Inputs**: Xiaohongshu link `http://xhslink.com/o/AAbGLpO7BY4`
- **Deliverables**
  - Verify which tool `cmux` actually refers to (project / CLI identity)
  - Compare against ≥ 3 of: `tmux`, `zellij`, `screen`, WezTerm mux, Warp
  - Role taxonomy: multiplexer vs session orchestration vs pane/tab workflow
  - Concrete Claude Code workflow (e.g., agent pane / logs pane / edit-git-test pane / long-task monitor pane)
  - Limits and when it is overkill
- **Target location**: `content/tooling/cmux-claude-code-workflow.md`
- **Diagram**: optional Mermaid `direction LR` for multi-pane workflow

---

## Delegation notes for `git-auto.md`

1. On each run, pick the **lowest-numbered** open issue from the execution order above that is not already `in_progress` or `pr_open`.
2. Use `@writer` as primary agent per the mapping; escalate to `@diagram` for Mermaid work and `@reviewer` for final quality pass before push.
3. Respect `CLAUDE.md` writing rules:
   - `kebab-case` filenames
   - `title` frontmatter required
   - Mermaid `direction LR` only
   - Bullet-first, copy-pasteable, no fluff
4. Keep scope tight — one issue per branch; unrelated fixes go to a new issue, not this branch.
5. After the writer completes a draft, `@reviewer` audits for accuracy, style, and completeness before commit.
