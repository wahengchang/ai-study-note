# Research & Writing Queue — Execution Plan

> Generated: 2026-04-11
> Branch: `claude/awesome-hamilton-y3o8U`
> Source: GitHub issue queue audit (`wahengchang/ai-study-note`)

## Audit Summary

Seven open issues were audited. Five are research/writing tasks that fit the
content pipeline; two are excluded (see below). Each selected issue is mapped
to a primary agent from `claude/config.yaml` and supporting agents where the
deliverable benefits from a second skill set.

| # | Issue | Type | Primary Agent | Support | Target Path |
|---|---|---|---|---|---|
| 77 | Terminal multiplexing + Claude Code (`cmux`) | Research → Note | `@writer` | `@diagram` | `content/claude-code/terminal-multiplexing-workflow.md` |
| 76 | n8n YouTube automation workflow | Research → Note | `@writer` | `@diagram` | `content/ai-workflows/n8n-youtube-automation.md` |
| 75 | LLM knowledge management (raw/wiki) | Research → Note | `@writer` | `@diagram` | `content/knowledge-management/llm-raw-wiki-workflow.md` |
| 74 | Astron Agent / Serper / Jina / Python node / LLM | Writing | `@writer` | `@reviewer` | `content/ai-workflows/astron-agent-workflow-components.md` |
| 61 | Open-source prompt auto-optimizer (Xiaohongshu) | Research → Note | `@writer` | `@reviewer` | `content/prompt-notes/auto-prompt-optimizer-research.md` |

### Excluded from this batch

- **#67 — Duplicate article titles.** Layout/template fix; belongs to a
  frontend task, not the research/writing pipeline. Route separately via
  `@content-ops` or a theme patch.
- **#63 — Mintlify framework adoption.** Platform/engineering evaluation,
  not a content note. Route to a dedicated infra planning track.

---

## Per-Issue Operational Analysis

### Issue #77 — Terminal multiplexing workflow for Claude Code

- **Deliverable**: one research note + tool comparison table + minimal
  workflow recipe.
- **Operational requirements**:
  - Resolve the original Xiaohongshu link (`http://xhslink.com/o/AAbGLpO7BY4`)
    and confirm whether `cmux` refers to a specific project, a generic term
    for a terminal multiplexer, or a fork.
  - Compare against `tmux`, `zellij`, `screen`, and WezTerm/Warp mux models.
  - Document 3+ concrete Claude Code pane layouts (agent, logs, edit/git,
    long-running monitor).
  - Capture limits: session persistence, pane scrollback, copy buffers,
    remote vs. local sessions.
- **Primary agent**: `@writer` — authoring and classification (Architect
  objective).
- **Support**: `@diagram` — a LR Mermaid diagram showing a four-pane layout
  around one Claude Code session.
- **Acceptance (from issue)**: original tool identity confirmed, 3+ tool
  comparisons, 1 Claude Code workflow, explicit applicability and limits.

### Issue #76 — n8n AI-powered YouTube automation

- **Deliverable**: research note + categorised tool inventory + minimal PoC
  architecture.
- **Operational requirements**:
  - Decompose the end-to-end workflow from the referenced YouTube video into
    discrete stages: ideation → script → visuals → audio → assembly →
    publish → logging/notification.
  - Produce a tool matrix across orchestration, LLM, visual, audio,
    rendering, publishing, storage categories.
  - Flag risks: YouTube policy on synthetic content, copyright on music and
    voices, duplicate-content penalties, API cost modelling.
  - Assess Chinese/Traditional Chinese viability.
- **Primary agent**: `@writer` — Architect-objective note with cost/risk
  analysis.
- **Support**: `@diagram` — LR pipeline diagram of the reference workflow
  and a simplified PoC variant.
- **Acceptance (from issue)**: full workflow map, per-tool pros/cons, 1
  landable PoC, explicit risk section.

### Issue #75 — LLM knowledge management: raw + wiki

- **Deliverable**: study note on the two-layer (raw / wiki) LLM knowledge
  system, with outline or initial draft.
- **Operational requirements**:
  - Preserve the immutability rule of the raw layer and the living nature of
    the wiki layer.
  - Describe how the LLM converts raw → structured wiki entries: summary,
    classification, cross-links.
  - Explain how wiki-level queries create new observations that feed back
    into the wiki.
  - Keep the implementation stack minimal: IDE + Obsidian + Markdown + Git.
  - Credit sources (Andrej Karpathy, 林穎俊) without deep-linking private
    posts.
- **Primary agent**: `@writer` — Architect objective, personal knowledge
  management system framing.
- **Support**: `@diagram` — LR diagram: sources → raw store → LLM processor
  → wiki → query loop → wiki.
- **Acceptance (from issue)**: topic and outline set, raw/wiki value clearly
  separated, query/feedback loop covered, publishable framework.

### Issue #74 — Astron Agent / Serper / Jina / Python node / LLM

- **Deliverable**: publishable study note framing these five components as
  distinct roles in a single AI workflow.
- **Operational requirements**:
  - One-line positioning per component (agent framework vs. search API vs.
    embedding/retrieval vs. custom code node vs. LLM).
  - Free tier vs. paid usage notes with official links.
  - A plain-language summary section accessible to non-technical readers.
  - Closing paragraph: these are workflow parts, not competing AI tools.
- **Primary agent**: `@writer` — synthesis from an existing draft, minimal
  fresh research.
- **Support**: `@reviewer` — verify pricing claims and official links since
  these change frequently.
- **Acceptance (from issue)**: clear title, outline/draft, no confusion
  between positioning and pricing, explicit "different parts, not different
  tools" framing.

### Issue #61 — Open-source prompt auto-optimizer (Xiaohongshu)

- **Deliverable**: research summary identifying the referenced project and
  assessing fit for `ai-study-note`.
- **Operational requirements**:
  - Identify the underlying GitHub repo referenced in
    `http://xhslink.com/o/7iAalKtM6SX`.
  - TL;DR in 3–5 lines, core feature list, applicable scenarios.
  - 3+ reusable takeaways.
  - Final recommendation: include in `ai-study-note` or not, with reason.
- **Primary agent**: `@writer` — compact research note.
- **Support**: `@reviewer` — validate the repo identity and claimed
  features before publishing.
- **Acceptance (from issue)**: source project confirmed, readable summary, 3
  reusable points, inclusion decision.

---

## Execution Workflow

```mermaid
flowchart LR
    Q[Issue Queue] --> F[Filter: research / writing]
    F --> A[Operational Analysis]
    A --> D{Agent Match}
    D -->|content authoring| W[@writer]
    D -->|visualisation| G[@diagram]
    D -->|accuracy audit| R[@reviewer]
    W --> N[Draft Note in content/]
    G --> N
    R --> N
    N --> B[npm run quartz -- build]
    B --> PR[Open follow-up PR per issue]
```

### Per-issue kickoff checklist

- [ ] Branch from `claude/awesome-hamilton-y3o8U` with
      `claude/issue-<number>-<slug>`.
- [ ] Confirm sources and resolve any short-links before drafting.
- [ ] Draft note at the target path listed in the audit table.
- [ ] Invoke `@diagram` only where it adds clarity (LR orientation).
- [ ] Run `npm run quartz -- build` and `npm run check`.
- [ ] Link the PR back to the originating issue with `Closes #<n>`.

### Batch order (recommended)

1. **#74** — lowest research load; existing draft exists.
2. **#61** — single-source research; short deliverable.
3. **#75** — conceptual note; limited tool validation.
4. **#77** — medium research; requires source resolution.
5. **#76** — highest scope; full pipeline + risk section.

---

## Agent References

- `claude/agents/writer.md` — Principal Engineer voice, evidence-based.
- `claude/agents/reviewer.md` — Accuracy, style, completeness audit.
- `claude/agents/diagram.md` — Mermaid LR diagrams only.
- `claude/agents/content-ops.md` — File org, frontmatter, bulk edits.
- `claude/config.yaml` — Agent registry and project defaults.
