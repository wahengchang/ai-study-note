# Research & Writing Dispatch Plan

> Generated: 2026-04-12
> Source: GitHub issue queue audit (7 open → 5 filtered)
> Workflow: `cron/git-auto.md`
> Execution order: ascending by issue number (per git-auto invariant)

## Filter Criteria

- **Included**: issues whose primary deliverable is a research note, study note, or article draft
- **Excluded**: engineering tasks (#63 Mintlify migration), bug fixes (#67 duplicate titles)

## Dispatch Queue

### 1. Issue #61 — Research: open-source prompt optimization project

| Field | Value |
|-------|-------|
| Branch | `auto/issue-61` |
| Primary agent | `@writer` |
| Support agents | `@reviewer` |
| Source | 小紅書 link (external) |

**Operational requirements:**

- Web research to identify the open-source project referenced in the 小紅書 post
- Produce: project name, repo URL, TL;DR (3–5 lines), core features, applicable scenarios
- Output path: `content/prompt-notes/<project-slug>.md`
- Validation: `npm run quartz -- build` exit 0

**Agent workflow:**

1. `@writer` — Research the source link, identify the OSS project, draft study note with frontmatter
2. `@reviewer` — Verify DoD: source confirmed, 3+ reusable takeaways, inclusion recommendation present

---

### 2. Issue #74 — Write study note: Astron Agent, Serper, Jina AI, Python node, LLM

| Field | Value |
|-------|-------|
| Branch | `auto/issue-74` |
| Primary agent | `@writer` |
| Support agents | `@diagram`, `@reviewer` |
| Source | User-provided Telegram notes |

**Operational requirements:**

- Draft article covering 5 tools/components: Astron Agent, Serper.dev, Jina AI, Python node, LLM
- Each tool: role (model / tool / platform / logic node), pricing model, official link
- Include a workflow diagram showing how these components collaborate
- Audience: accessible to non-technical readers
- Output path: `content/claude-code/ai-workflow-tools-overview.md`
- Validation: `npm run quartz -- build` exit 0

**Agent workflow:**

1. `@writer` — Draft article with tool breakdowns, pricing section, workflow summary
2. `@diagram` — Generate LR flowchart showing tool roles in a single AI workflow pipeline
3. `@reviewer` — Validate: no tool/pricing confusion, clear component-vs-product distinction

---

### 3. Issue #75 — Research: LLM-based knowledge management (raw/wiki workflow)

| Field | Value |
|-------|-------|
| Branch | `auto/issue-75` |
| Primary agent | `@writer` |
| Support agents | `@diagram`, `@reviewer` |
| Source | Facebook post, user notes, Karpathy & 林穎俊 references |

**Operational requirements:**

- Research the raw/wiki two-layer knowledge management pattern
- Core concept: raw = immutable source material; wiki = evolving structured knowledge
- Cover: AI-driven summarization, classification, cross-referencing, knowledge loop
- Toolchain context: IDE + Obsidian + Markdown + Git
- Output path: `content/prompt-notes/llm-knowledge-management-raw-wiki.md`
- Validation: `npm run quartz -- build` exit 0

**Agent workflow:**

1. `@writer` — Research concept, draft study note with flow explanation and practical setup
2. `@diagram` — Generate LR diagram: raw → AI processing → wiki → query → feedback loop
3. `@reviewer` — Validate: raw/wiki separation clearly explained, references attributed

---

### 4. Issue #76 — Research: AI-powered YouTube automation (n8n)

| Field | Value |
|-------|-------|
| Branch | `auto/issue-76` |
| Primary agent | `@writer` |
| Support agents | `@diagram`, `@content-ops`, `@reviewer` |
| Source | YouTube video (Japanese, n8n-based workflow) |

**Operational requirements:**

- Deconstruct the end-to-end automation workflow from the video
- Inventory 20+ tools across 7 categories: orchestration, LLM, visual, audio, rendering, publishing, storage
- Assess: no-code vs. engineering-required steps, API cost structure, Chinese-content feasibility
- Produce a minimal PoC architecture
- Flag risks: content quality, copyright, YouTube policy, duplicate content
- Output path: `content/prompt-notes/ai-youtube-automation-n8n.md`
- Validation: `npm run quartz -- build` exit 0

**Agent workflow:**

1. `@writer` — Research video content, draft note with workflow breakdown and tool inventory
2. `@diagram` — Generate LR flowchart: end-to-end pipeline from ideation → publish → monitoring
3. `@content-ops` — Organize tool classification table (7 categories × tools per category)
4. `@reviewer` — Validate: complete tool inventory, risk section present, PoC is actionable

---

### 5. Issue #77 — Research: terminal multiplexing for Claude Code productivity

| Field | Value |
|-------|-------|
| Branch | `auto/issue-77` |
| Primary agent | `@writer` |
| Support agents | `@diagram`, `@reviewer` |
| Source | 小紅書 link (external) |

**Operational requirements:**

- Identify the tool referenced in the 小紅書 post (cmux or similar)
- Compare terminal multiplexers: cmux, tmux, zellij, WezTerm, screen
- Document Claude Code multi-pane workflow patterns (agent / logs / git / monitoring)
- Produce a recommended minimal workflow setup
- Output path: `content/claude-code/terminal-multiplexing-claude-code.md`
- Validation: `npm run quartz -- build` exit 0

**Agent workflow:**

1. `@writer` — Research source, identify tool, draft comparison note with practical workflow
2. `@diagram` — Generate LR diagram: recommended pane layout for Claude Code sessions
3. `@reviewer` — Validate: tool identified, 3+ tools compared, practical workflow included

---

## Execution Protocol

Each issue follows the `cron/git-auto.md` lifecycle:

```
1. Mark issue `in_progress` in .automation/issues.json
2. git fetch origin && git checkout -B auto/issue-<N> origin/main
3. Run agent workflow (primary → support agents in sequence)
4. npm run quartz -- build   # must exit 0
5. git diff --cached --stat  # verify no .automation/ files staged
6. Stage files by explicit path → commit → push
7. Create PR linking to issue
8. Mark issue `pr_open` in tracker
```

## Summary

| Priority | Issue | Primary Agent | Support Agents | Complexity |
|----------|-------|---------------|----------------|------------|
| 1 | #61 | `@writer` | `@reviewer` | Low |
| 2 | #74 | `@writer` | `@diagram`, `@reviewer` | Medium |
| 3 | #75 | `@writer` | `@diagram`, `@reviewer` | Medium |
| 4 | #76 | `@writer` | `@diagram`, `@content-ops`, `@reviewer` | High |
| 5 | #77 | `@writer` | `@diagram`, `@reviewer` | Medium |
