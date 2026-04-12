# Execution Dispatch Queue

> Generated: 2026-04-12
> Source: GitHub issue audit — filtered for research & writing tasks
> Workflow: `cron/git-auto.md`

## Audit Summary

| Metric | Value |
|--------|-------|
| Total open issues | 7 |
| Research/writing tasks | 5 |
| Already have open PRs | 2 (#61 → PR #73, #74 → PR #103) |
| Excluded (non-writing) | 2 (#67 bug fix, #63 infra migration) |
| **Actionable this cycle** | **3** |

## Dispatch Queue

Issues are ordered by number (lowest first) per `git-auto.md` §4.

### 1. Issue #75 — LLM-based knowledge management (raw/wiki workflow)

- **Branch**: `auto/issue-75`
- **Agent**: `@writer`
- **Type tag**: `research`
- **Subject tags**: `prompt-engineering`, `agent-architecture`
- **Placement**: `content/prompt-notes/llm-knowledge-management-raw-wiki.md`
- **Placement note**: Related note exists at `content/prompt-notes/karpathy-llm-wiki-pattern.md` (from #65). This issue covers the user's own implementation angle — raw/wiki two-layer separation, AI-driven summarization, and self-reinforcing knowledge loops. Distinct scope; not a duplicate.
- **Deliverables**:
  - Learn note / study note with clear heading structure
  - Explain raw vs wiki layer separation and why it matters
  - Cover the self-reinforcing loop (query → new insight → write-back)
  - Reference Karpathy and 林穎俊 approaches
  - Include a Mermaid `flowchart LR` showing the raw → wiki → query cycle
- **Acceptance criteria** (from issue):
  - Clear article topic and outline
  - Core flow design and advantages documented
  - Raw/wiki separation value explained
  - Content framework extensible to a public note

### 2. Issue #76 — AI-powered YouTube automation workflow (n8n)

- **Branch**: `auto/issue-76`
- **Agent**: `@writer`
- **Type tag**: `research`
- **Subject tags**: `automation`
- **Tech tags**: `n8n`
- **Placement**: `content/prompt-notes/ai-youtube-automation-n8n.md`
- **Placement note**: Decision tree hits STOP (not Claude Code, not OpenClaw, not prompt engineering, not devops, not SEO). Closest fit is `prompt-notes/` as research. If the repo later adds an `automation/` folder, this note should migrate. Flag for `@content-ops` review.
- **Deliverables**:
  - End-to-end workflow breakdown (ideation → script → visuals → audio → assembly → publish)
  - Tool inventory table grouped by category (orchestration, LLM, visual, audio, rendering, publishing)
  - Minimal PoC architecture sketch (Mermaid `flowchart LR`)
  - Risk section: content quality, copyright, YouTube policy, API costs
- **Acceptance criteria** (from issue):
  - Complete workflow with tool classification
  - Each tool category has purpose, strengths, limitations
  - At least 1 actionable PoC proposal
  - Risks clearly labeled

### 3. Issue #77 — Terminal multiplexing workflow for Claude Code productivity

- **Branch**: `auto/issue-77`
- **Agent**: `@writer`
- **Type tag**: `research`
- **Subject tags**: `claude-code`
- **Tech tags**: `tmux`
- **Placement**: `content/claude-code/terminal-multiplexing-workflow.md`
- **Placement note**: Primarily about Claude Code productivity → `content/claude-code/`. Not a plugin/hook/skill, so top-level placement.
- **Deliverables**:
  - Identify the actual tool referenced in the original post (cmux vs tmux vs other)
  - Tool comparison table: cmux, tmux, zellij, WezTerm, Warp
  - Practical multi-pane workflow for Claude Code (agent / logs / git-test / monitor)
  - Mermaid diagram showing recommended pane layout
  - Minimum viable workflow recipe
- **Acceptance criteria** (from issue):
  - Original tool identity confirmed
  - At least 3 tools compared
  - At least 1 practical workflow documented
  - Use cases and limitations stated

## Execution Protocol

Each issue follows `cron/git-auto.md`:

1. Mark `in_progress` in `.automation/issues.json`
2. `git fetch origin && git checkout -B auto/issue-<N> origin/main`
3. Invoke `@writer` agent with the issue body + deliverables above
4. Run `@reviewer` agent on the draft output
5. Validate: `npm run quartz -- build` exits 0
6. Stage files by explicit path only (never `git add .`)
7. Commit, push, open PR referencing `closes #<N>`
8. Mark `pr_open` in tracker
9. Process one issue per run — do not batch

## Agent Capability Matrix

| Agent | Role | Issues |
|-------|------|--------|
| `@writer` | Primary author for all 3 research notes | #75, #76, #77 |
| `@reviewer` | Post-draft quality audit | #75, #76, #77 |
| `@diagram` | Mermaid generation (invoked by `@writer` as needed) | #75, #76, #77 |
| `@content-ops` | Placement validation; #76 needs taxonomy review | #76 |
