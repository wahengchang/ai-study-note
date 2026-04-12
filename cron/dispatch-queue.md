# Dispatch Queue — Research & Writing Issues

> Generated: 2026-04-12
> Source: `wahengchang/ai-study-note` open issue queue
> Workflow: [`cron/git-auto.md`](./git-auto.md)

## Audit Summary

| Metric | Count |
|--------|-------|
| Total open issues | 7 |
| Filtered in (research & writing) | 5 |
| Filtered out (infra / bug fix) | 2 |

### Filtered Out

| # | Title | Reason |
|---|-------|--------|
| 67 | Fix duplicate article titles | Bug fix — layout/template issue, not content authoring |
| 63 | Adopt Mintlify as new framework | Infrastructure — framework migration, no research/writing deliverable |

---

## Dispatch Table

Issues are ordered by number (lowest first), matching `cron/git-auto.md` processing order.

| # | Agent | Content Path | Tags | Priority |
|---|-------|-------------|------|----------|
| 61 | `@writer` | `content/prompt-notes/` | `research`, `prompt-engineering` | 1 (next) |
| 74 | `@writer` | `content/openclaw/` ¹ | `research`, `agent-architecture`, `automation` | 2 |
| 75 | `@writer` + `@diagram` | `content/prompt-notes/` ² | `research`, `agent-architecture` | 3 |
| 76 | `@writer` + `@diagram` | `content/openclaw/` ¹ | `research`, `automation`, `n8n` | 4 |
| 77 | `@writer` + `@diagram` | `content/claude-code/tools-and-skills/` | `research`, `claude-code`, `tmux` | 5 |

¹ Placement requires `@content-ops` confirmation — decision tree reaches STOP for general AI workflow topics.
² LLM-based knowledge management overlaps prompt-engineering and agent-architecture; `@content-ops` should confirm.

---

## Issue Breakdown

### Issue #61 — Research: 自動優化專業級提示詞 (open-source prompt optimizer)

**Source**: 小紅書 post about an open-source project that automatically optimizes professional-grade prompts.

**Operational requirements**:
- Web research to identify the actual open-source project from the social media reference
- Summarize core functionality, use cases, and applicability
- Produce a research note with at least 3 reusable takeaways

**Agent delegation**:
- **Primary**: `@writer` — research-then-write pattern, produce a Quartz-compatible study note
- **Template**: Research note (Context → Key Findings → Steps / Implementation)

**Deliverable**: `content/prompt-notes/auto-prompt-optimizer-research.md`

**Acceptance criteria** (from issue):
- Confirm original project source
- Readable research summary
- ≥3 reusable findings
- Conclusion on whether to include in ai-study-note

---

### Issue #74 — Write: AI Workflow Components (Astron Agent, Serper, Jina AI, Python node, LLM)

**Source**: User-provided notes from Telegram group about AI workflow tool components and their roles/pricing.

**Operational requirements**:
- Structure existing source material into a clear study note
- Distinguish each tool's role (model vs. tool vs. platform vs. logic node)
- Include pricing/free-tier information and official links
- Frame as "workflow components," not a single AI tool

**Agent delegation**:
- **Primary**: `@writer` — convert existing notes into Quartz-formatted study note
- **Supporting**: `@diagram` — optional workflow component diagram showing tool relationships
- **Template**: Research note with embedded comparison table

**Deliverable**: `content/openclaw/ai-workflow-components-study.md` (pending `@content-ops` placement confirmation)

**Acceptance criteria** (from issue):
- Clear article title
- Publishable outline or draft
- Tool roles and pricing not confused
- Explicit framing as workflow components, not a single tool

---

### Issue #75 — Research: LLM-Based Knowledge Management (raw/wiki workflow)

**Source**: User's in-progress implementation referencing Andrej Karpathy and 林穎俊's approaches to LLM-managed knowledge systems.

**Operational requirements**:
- Research the raw/wiki two-layer separation design
- Document the knowledge lifecycle: raw intake → AI structuring → wiki evolution → query → feedback loop
- Reference Karpathy's approach and practical IDE + Obsidian + Git implementation

**Agent delegation**:
- **Primary**: `@writer` — produce a learn note covering concept, workflow, and practical implementation
- **Supporting**: `@diagram` — knowledge lifecycle flowchart (raw → wiki → query → feedback)
- **Template**: Research note with lifecycle diagram

**Deliverable**: `content/prompt-notes/llm-knowledge-management-raw-wiki.md` (pending `@content-ops` placement confirmation)

**Acceptance criteria** (from issue):
- Clear topic and outline
- Core design and advantages documented
- raw/wiki separation value articulated
- Framework extensible to public note format

---

### Issue #76 — Research: AI-Powered YouTube Automation (n8n workflow)

**Source**: Japanese YouTube video demonstrating fully automated YouTube video generation using n8n + AI tools.

**Operational requirements**:
- Decompose end-to-end workflow into stages (ideation → script → visual → audio → assembly → publish)
- Catalog tools by category (orchestration, LLM, visual, audio, rendering, publishing)
- Assess no-code vs. engineering integration requirements
- Evaluate cost, copyright, and platform policy risks
- Propose a minimal viable PoC architecture

**Agent delegation**:
- **Primary**: `@writer` — research note with workflow decomposition and tool catalog
- **Supporting**: `@diagram` — end-to-end workflow diagram (LR orientation, 4-6 core nodes)
- **Template**: Research note + tool comparison table + PoC architecture sketch

**Deliverable**: `content/openclaw/youtube-automation-n8n-research.md` (pending `@content-ops` placement confirmation)

**Acceptance criteria** (from issue):
- Complete workflow with tool classifications
- Tool purpose, strengths, and limitations documented
- ≥1 actionable PoC proposal
- Risk section: content quality, copyright, duplicate content, YouTube policies

---

### Issue #77 — Research: Terminal Multiplexing for Claude Code Productivity

**Source**: 小紅書 post claiming 3x Claude Code productivity boost via terminal multiplexing (cmux).

**Operational requirements**:
- Identify the actual tool referenced (cmux vs. tmux vs. other)
- Compare terminal multiplexers: cmux, tmux, zellij, WezTerm
- Document multi-pane workflow patterns for Claude Code (agent, logs, edit/git, monitoring)
- Produce actionable workflow recommendation

**Agent delegation**:
- **Primary**: `@writer` — research note with tool comparison and workflow recommendation
- **Supporting**: `@diagram` — terminal pane layout diagram or tool comparison flowchart
- **Template**: Research note + comparison table + recommended workflow

**Deliverable**: `content/claude-code/tools-and-skills/terminal-multiplexing-workflow.md`

**Acceptance criteria** (from issue):
- Confirm original tool identity and purpose
- ≥3 comparable tools/workflows
- ≥1 practical Claude Code workflow
- Clear applicability and limitations

---

## Execution Protocol

Each issue follows `cron/git-auto.md`:

1. Load `.automation/issues.json` (local tracker, never committed)
2. Pick lowest-number issue with status `pending`
3. Branch from `origin/main`: `git checkout -B auto/issue-<N> origin/main`
4. Mark `in_progress` in tracker
5. Execute agent delegation:
   - `@writer` produces draft following its note template
   - `@diagram` adds Mermaid diagrams where marked
   - `@reviewer` audits the final note before commit
   - `@content-ops` confirms placement if decision tree reaches STOP
6. Validate: `npm run quartz -- build` exits 0
7. Commit by explicit path, push, create PR
8. Mark `pr_open` in tracker

**One issue per run. Do not batch.**
