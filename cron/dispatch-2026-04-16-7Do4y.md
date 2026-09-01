# Dispatch Plan — 2026-04-16 (session 7Do4y)

> Tick for [`cron/git-auto.md`](./git-auto.md). Audits the open issue queue,
> filters to **research + writing** scope, captures operational requirements,
> and delegates each to agents from [`claude/config.yaml`](../claude/config.yaml).

## 1. Issue Queue Audit

**Scanned**: 6 open issues (2026-04-16)
**Filtered**: 5 research/writing tasks
**Excluded**: 1 bug fix

### Exclusion

| # | Title | Reason |
|---|-------|--------|
| #67 | Fix duplicate article titles | Layout/template bug — `@content-ops` lane, covered by PR #68 |

## 2. Filtered Queue — Operational Requirements

### #61 — Research: auto prompt optimization OSS project

| Field | Value |
|-------|-------|
| **Class** | Research |
| **Primary agent** | `@writer` |
| **Supporting** | `@reviewer` |
| **Source** | Xiaohongshu link (xhslink.com — login-wall blocked) |
| **Deliverable** | Research note: project name, TL;DR, core features, use cases, fit for ai-study-note |
| **Target path** | `content/prompt-notes/auto-prompt-optimization-tools.md` |
| **Tags** | `research`, `prompt-engineering` |
| **Risk** | Source inaccessible without Xiaohongshu auth — requires clarification from issue author |
| **Gate** | `clarification_needed` until source is identified; do not fabricate |
| **Existing PRs** | #73, #165 — both blocked on source verification |

### #74 — Writing: AI workflow components study note

| Field | Value |
|-------|-------|
| **Class** | Writing |
| **Primary agent** | `@writer` |
| **Supporting** | `@diagram` (workflow parts diagram, `direction LR`), `@reviewer` |
| **Source** | User-provided Telegram notes on Astron Agent, Serper.dev, Jina AI, Python node, LLM |
| **Deliverable** | Study note: role taxonomy, pricing/free-tier breakdown, workflow diagram |
| **Target path** | `content/claude-code/tools-and-skills/ai-workflow-components.md` or `content/prompt-notes/ai-workflow-components.md` |
| **Tags** | `research`, `agent-architecture`, `automation` |
| **Risk** | Taxonomy placement ambiguous — not clearly Claude Code, prompt engineering, or automation. Decision tree hits STOP. Existing PRs disagree (#169 → `claude-code/tools-and-skills/`, #185 → `content/ai-workflows/`) |
| **Gate** | `@content-ops` arbitration needed for placement |
| **Existing PRs** | #164 (dup — close), **#169** (keep — stronger taxonomy fit per #178) |

### #75 — Research + Writing: LLM knowledge management (raw/wiki)

| Field | Value |
|-------|-------|
| **Class** | Research + Writing |
| **Primary agent** | `@writer` |
| **Supporting** | `@diagram` (raw→wiki→query loop, `direction LR`), `@reviewer` |
| **Source** | User notes referencing Andrej Karpathy and 林穎俊 approaches |
| **Deliverable** | Learn note: raw/wiki separation design, AI-driven summarization loop, query/writeback cycle |
| **Target path** | `content/prompt-notes/llm-knowledge-management-raw-wiki.md` |
| **Tags** | `research`, `agent-architecture` |
| **Risk** | Scope creep — user wants both conceptual overview and implementation guidance. Keep to research scope; implementation is out of scope per issue body |
| **Gate** | Standard `@reviewer` audit |
| **Existing PRs** | #156 (singleton — ready for review) |

### #76 — Research + Writing: n8n AI YouTube automation

| Field | Value |
|-------|-------|
| **Class** | Research + Writing |
| **Primary agent** | `@writer` |
| **Supporting** | `@diagram` (6-stage pipeline flowchart, `direction LR`), `@reviewer` |
| **Source** | YouTube video (Japanese) on n8n-based fully automated YouTube content pipeline |
| **Deliverable** | Research note: end-to-end workflow breakdown, tool inventory by category, PoC architecture, cost/risk assessment |
| **Target path** | `content/prompt-notes/n8n-youtube-automation-research.md` |
| **Tags** | `research`, `automation`, `n8n` |
| **Risk** | Tool inventory is large (20+ tools across 7 categories); keep summary concise, defer deep-dives to follow-up issues. Copyright and YouTube policy risks must be explicitly noted |
| **Gate** | Standard `@reviewer` audit; verify tool links and pricing are current |
| **Existing PRs** | #154 (singleton — ready for review) |

### #77 — Research: terminal multiplexing for Claude Code

| Field | Value |
|-------|-------|
| **Class** | Research |
| **Primary agent** | `@writer` |
| **Supporting** | `@diagram` (optional — pane layout if it adds clarity), `@reviewer` |
| **Source** | Xiaohongshu link (xhslink.com) on `cmux` / terminal workflow for Claude Code |
| **Deliverable** | Research note: identify the actual tool, compare cmux/tmux/zellij/WezTerm, recommend a Claude Code pane layout |
| **Target path** | `content/claude-code/tools-and-skills/terminal-multiplexing-for-claude-code.md` |
| **Tags** | `research`, `claude-code`, `tmux` |
| **Risk** | Source behind Xiaohongshu login wall (same as #61). However, cmux/tmux comparison can proceed independently of source confirmation |
| **Gate** | Source verification preferred but not blocking for the comparison portion |
| **Existing PRs** | #166 (dup — close), **#170** (keep — stronger taxonomy fit per #178) |

## 3. Agent Delegation Matrix

| # | Primary | Supporting | `@content-ops` needed? |
|---|---------|------------|------------------------|
| #61 | `@writer` | `@reviewer` | No |
| #74 | `@writer` | `@diagram`, `@reviewer` | **Yes** — placement dispute |
| #75 | `@writer` | `@diagram`, `@reviewer` | No |
| #76 | `@writer` | `@diagram`, `@reviewer` | No |
| #77 | `@writer` | `@diagram` (opt), `@reviewer` | No |

## 4. Queue Status

All 5 filtered issues already have at least one open implementation PR.
Per `cron/git-auto.md` §4: *"If issue already has an open PR, skip it."*

**No new `auto/issue-<n>` branch is opened this tick.**

### Duplicate PRs requiring reconciliation (per #178)

| Issue | Keep | Close | Action needed before merge |
|-------|------|-------|---------------------------|
| #74 | **#169** | #164 | Add missing `index.md` wikilink |
| #77 | **#170** | #166 | Add missing `index.md` wikilink |

### Singleton PRs ready for review

| Issue | PR | Status |
|-------|-----|--------|
| #75 | #156 | Ready for review |
| #76 | #154 | Ready for review |

### Blocked

| Issue | PR(s) | Blocker |
|-------|-------|---------|
| #61 | #73, #165 | `clarification_needed` — xhslink source inaccessible |

## 5. Triage PR Accumulation

Prior cron ticks have generated a cluster of triage-only PRs that should be
closed once the consolidated triage (#178) is merged:

**Superseded by #178**: #162, #163, #167, #168, #171, #172, #173, #174, #175, #176, #177

**Deferral stubs to #178**: #179, #180, #181, #182, #183, #184, #185, #186

**Recommendation**: merge #178, then close the entire superseded + deferral cluster in one sweep.

## 6. Execution Order (when queue drains)

Once existing PRs are merged or closed, the next `cron/git-auto.md` tick
should process any remaining unresolved issues in this order:

1. **#61** — lowest number; unblock by resolving xhslink source first
2. **#74** — merge #169 (after index link fix) or re-execute if #169 is stale
3. **#75** — merge #156
4. **#76** — merge #154
5. **#77** — merge #170 (after index link fix) or re-execute if #170 is stale

## 7. Invariants Honored

- [x] `git fetch origin` succeeded; base verified at `origin/main` @ `155880d`
- [x] No new `auto/issue-<n>` branch opened — queue saturated per §4
- [x] `.automation/` stays local-only — never staged
- [x] Staging by explicit path only
- [x] One branch, one PR
