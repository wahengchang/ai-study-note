# Dispatch Queue — Research & Writing Tasks

> Generated: 2026-04-12
> Source: GitHub issue queue audit (7 open issues → 5 filtered)
> Workflow: `cron/git-auto.md`
> Processing order: lowest issue number first, one per run

## Filter Criteria

- **Included**: Issues requiring research, writing, or study note authoring
- **Excluded**: Infrastructure migration (#63), bug fixes (#67)

## Queue

### 1. Issue #61 — Research: prompt optimization OSS project (小紅書)

- **Type**: Research
- **Agent**: `@writer`
- **Secondary**: `@reviewer` (QA after draft)
- **Branch**: `auto/issue-61`
- **Deliverable**: Research summary note under `content/`
- **Operational requirements**:
  - Identify the open-source project referenced in the Xiaohongshu post
  - Produce TL;DR, core features, applicable scenarios
  - Assess fit for `ai-study-note` inclusion
- **Definition of Done**: Confirmed project source, readable research summary, 3+ reusable takeaways, inclusion recommendation

### 2. Issue #74 — Write study note: AI workflow tools (Astron Agent, Serper, Jina AI, Python node, LLM)

- **Type**: Writing
- **Agent**: `@writer`
- **Secondary**: `@diagram` (workflow visualization), `@reviewer` (QA)
- **Branch**: `auto/issue-74`
- **Deliverable**: Study note draft under `content/`
- **Operational requirements**:
  - Explain each tool's role: AI model vs tool vs platform vs logic node
  - Clarify pricing: free tier, paid, common cost structures
  - Include official links for each tool
  - Frame as workflow component breakdown, not single-tool review
  - Write for non-technical readers with accessible language
- **Definition of Done**: Clear article title, publishable draft/outline, no role confusion between tools, workflow framing established

### 3. Issue #75 — Research + Write: LLM-based knowledge management (raw/wiki workflow)

- **Type**: Research + Writing
- **Agent**: `@writer`
- **Secondary**: `@diagram` (raw→wiki flow visualization), `@reviewer` (QA)
- **Branch**: `auto/issue-75`
- **Deliverable**: Learn note / study note under `content/`
- **Operational requirements**:
  - Document raw/wiki two-layer separation design
  - Explain: raw = immutable source material, wiki = evolving structured knowledge
  - Cover AI-driven structuring, summarization, classification, and cross-linking
  - Reference Andrej Karpathy and 林穎俊 approaches
  - Include IDE + Obsidian + Markdown + Git low-barrier implementation path
- **Definition of Done**: Clear topic and outline, core design + advantages documented, raw/wiki separation value explained, extensible content framework

### 4. Issue #76 — Research: AI-powered YouTube automation workflow (n8n)

- **Type**: Research
- **Agent**: `@writer`
- **Secondary**: `@diagram` (end-to-end workflow diagram), `@reviewer` (QA)
- **Branch**: `auto/issue-76`
- **Deliverable**: Research note + tool inventory under `content/`
- **Operational requirements**:
  - Decompose full workflow: ideation → script → visuals → audio → assembly → publish → monitor
  - Categorize all tools by function (orchestration, LLM, visual, audio, rendering, publishing, storage)
  - Assess no-code vs engineering integration requirements
  - Evaluate feasibility for zh-TW content workflows
  - Propose minimum viable PoC architecture
  - Flag risks: content quality, copyright, duplicate content, YouTube policy
- **Definition of Done**: Complete workflow with tool mapping, per-category tool analysis, 1+ actionable PoC proposal, risk annotations

### 5. Issue #77 — Research: terminal multiplexing for Claude Code productivity

- **Type**: Research
- **Agent**: `@writer`
- **Secondary**: `@reviewer` (QA)
- **Branch**: `auto/issue-77`
- **Deliverable**: Research note under `content/`
- **Operational requirements**:
  - Identify the actual tool referenced in the Xiaohongshu post (cmux / tmux / other)
  - Compare terminal multiplexers: cmux, tmux, zellij, WezTerm, screen
  - Document multi-pane workflows for Claude Code: agent pane, logs pane, edit/git/test pane, monitoring pane
  - Explain why terminal workflow design impacts AI coding efficiency
- **Definition of Done**: Tool identity confirmed, 3+ tools compared, 1+ practical Claude Code workflow documented, limitations noted

## Agent Delegation Summary

| Issue | Primary Agent | Secondary Agent(s) | Type |
|-------|--------------|---------------------|------|
| #61   | `@writer`    | `@reviewer`         | Research |
| #74   | `@writer`    | `@diagram`, `@reviewer` | Writing |
| #75   | `@writer`    | `@diagram`, `@reviewer` | Research + Writing |
| #76   | `@writer`    | `@diagram`, `@reviewer` | Research |
| #77   | `@writer`    | `@reviewer`         | Research |

## Excluded Issues

| Issue | Title | Reason |
|-------|-------|--------|
| #63   | Adopt Mintlify as new framework | Infrastructure/migration — not a research or writing task |
| #67   | Fix duplicate article titles | Bug fix — template/content convention issue |

## Execution Protocol

Per `cron/git-auto.md`:

1. Each run picks the **lowest-numbered unprocessed issue** from this queue
2. Branch fresh from `origin/main`: `git checkout -B auto/issue-<n> origin/main`
3. Delegate to the assigned primary agent for content generation
4. Run secondary agents (diagram, reviewer) as applicable
5. Validate build: `npm run quartz -- build` must exit 0
6. Stage files by explicit path — never `git add .` or `git add -A`
7. One commit, one push, one PR per issue
8. Record outcome in `.automation/issues.json` (local only, never committed)
