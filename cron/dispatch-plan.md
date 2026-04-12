# Issue Dispatch Plan — Research & Writing Tasks

> Generated: 2026-04-12
> Workflow: `cron/git-auto.md`
> Tracker: `.automation/issues.json` (local state — never committed)

## Audit Summary

| Metric | Count |
|--------|-------|
| Total open issues | 7 |
| Filtered (research/writing) | 5 |
| Excluded (bug fix / infra) | 2 |

## Dispatch Queue

Issues are ordered by number (lowest first), per `git-auto.md` §4.

### 1. Issue #61 — Research prompt optimization open-source project

| Field | Value |
|-------|-------|
| **Agent** | `@writer` |
| **Type** | Research |
| **Target** | `content/prompt-notes/auto-prompt-optimization-research.md` |
| **Tags** | `research`, `prompt-engineering` |
| **Branch** | `auto/issue-61` |

**Operational requirements:**
- Web research to identify the open-source project referenced in 小紅書 post
- Produce: project identity, TL;DR (3–5 lines), core features, applicable use cases
- Deliverable: one study note with research schema (Context → Key Findings → Steps)
- Validation: `npm run quartz -- build` exits 0

---

### 2. Issue #74 — Write study note on AI workflow components

| Field | Value |
|-------|-------|
| **Agent** | `@writer` |
| **Type** | Writing |
| **Target** | `content/prompt-notes/ai-workflow-tools-study.md` |
| **Tags** | `research`, `agent-architecture`, `automation` |
| **Branch** | `auto/issue-74` |

**Operational requirements:**
- Synthesize Telegram source material into structured study note
- Cover: Astron Agent, Serper.dev, Jina AI, Python node, LLM — role, pricing, links
- Frame as "workflow component inventory" not "single AI tool"
- Include pricing tier summary (free-start vs paid)
- Validation: `npm run quartz -- build` exits 0

> **Taxonomy note:** Placement hits STOP in decision tree (not clearly prompt-engineering, not devops, not Claude Code). Recommended `prompt-notes/` as research note. `@content-ops` should confirm placement before merge.

---

### 3. Issue #75 — Research LLM-based knowledge management (raw/wiki)

| Field | Value |
|-------|-------|
| **Agent** | `@writer` |
| **Type** | Research |
| **Target** | `content/prompt-notes/llm-knowledge-management-raw-wiki.md` |
| **Tags** | `research`, `prompt-engineering` |
| **Branch** | `auto/issue-75` |

**Operational requirements:**
- Research Karpathy + 林穎俊 approaches to LLM knowledge management
- Core concept: raw layer (immutable source) vs wiki layer (evolving knowledge)
- Explain: ingest → structure → query → feedback loop
- Reference existing note: `content/prompt-notes/karpathy-llm-wiki-pattern.md` — extend or companion, do not duplicate
- Deliverable: study note + flow description suitable for Mermaid (LR only)
- Validation: `npm run quartz -- build` exits 0

---

### 4. Issue #76 — Research AI-powered YouTube automation (n8n)

| Field | Value |
|-------|-------|
| **Agent** | `@writer` |
| **Type** | Research |
| **Target** | `content/prompt-notes/n8n-youtube-automation-research.md` |
| **Tags** | `research`, `automation`, `n8n` |
| **Branch** | `auto/issue-76` |

**Operational requirements:**
- Watch/research the referenced YouTube video on n8n × AI video generation
- Tear down end-to-end workflow: ideation → script → visuals → audio → assembly → publish
- Produce tool inventory table by category (orchestration, LLM, visual, audio, rendering, publishing)
- Assess: code-free claims, API cost structure, Chinese-content applicability
- Propose 1 minimum-viable PoC architecture
- Flag risks: content quality, copyright, YouTube policy
- Validation: `npm run quartz -- build` exits 0

---

### 5. Issue #77 — Research terminal multiplexing for Claude Code

| Field | Value |
|-------|-------|
| **Agent** | `@writer` |
| **Type** | Research |
| **Target** | `content/claude-code/terminal-multiplexing-workflow.md` |
| **Tags** | `research`, `claude-code`, `tmux` |
| **Branch** | `auto/issue-77` |

**Operational requirements:**
- Clarify what "cmux" refers to in original 小紅書 post (vs tmux/zellij/screen)
- Compare at least 3 terminal multiplexers: cmux, tmux, zellij (+ optional: WezTerm mux)
- Produce comparison table: features, Claude Code compatibility, learning curve
- Design 1 practical multi-pane workflow for Claude Code (agent / logs / git / monitor)
- Deliverable: study note with comparison table + recommended workflow
- Validation: `npm run quartz -- build` exits 0

## Excluded Issues

| # | Title | Reason |
|---|-------|--------|
| 67 | Fix duplicate article titles | Bug fix — requires template/layout changes, not research/writing |
| 63 | Adopt Mintlify as new framework | Architecture evaluation — infrastructure scope, not content authoring |

## Execution Protocol

Each issue follows `cron/git-auto.md`:

1. `git fetch origin && git checkout -B auto/issue-<N> origin/main`
2. `@writer` agent produces the note at `target_path`
3. `@reviewer` agent audits the draft (accuracy, style, completeness)
4. `npm run quartz -- build` must exit 0
5. Stage files by explicit path — never `git add .`
6. Push and create PR referencing `Closes #<N>`
7. Update `.automation/issues.json` status locally

## Agent Capability Matrix

| Agent | Issues | Role |
|-------|--------|------|
| `@writer` | #61, #74, #75, #76, #77 | Draft research/study notes from source material |
| `@reviewer` | all | Post-draft QA: accuracy, style compliance, completeness |
| `@content-ops` | #74 | Confirm taxonomy placement for ambiguous note |
| `@diagram` | #75, #77 | Generate Mermaid diagrams if visualization adds clarity |
