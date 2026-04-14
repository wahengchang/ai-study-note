# Issue Queue Audit — Research & Writing

> Generated for `./cron/git-auto.md` execution workflow.
> Scope: open issues filtered for research / writing deliverables only.

## Filter Criteria

| Criterion | Rule |
|-----------|------|
| State | `OPEN` |
| Task type | Research note, study note, writing draft, or content authoring |
| Excluded | Bug fixes, theme/layout fixes, site framework migrations, tooling |

## Filtered Queue (lowest number first, per `git-auto.md` §4)

| # | Title | Deliverable | Agent | Priority |
|---|-------|-------------|-------|----------|
| 61 | 研究小紅書：寶藏開源項目，自動優化專業級提示詞 | Research summary on the open-source prompt optimizer | `@writer` | **next** |
| 74 | Astron Agent / Serper / Jina AI / Python node / LLM study note | Publishable study note — roles & pricing in one workflow | `@writer` | queued |
| 75 | LLM-based knowledge management (raw / wiki) learn note | Study note on Karpathy-inspired raw+wiki pattern | `@writer` | queued |
| 76 | AI-powered YouTube automation (n8n) research | End-to-end workflow breakdown + tool matrix + PoC sketch | `@writer` | queued |
| 77 | cmux terminal multiplexing for Claude Code productivity | Research note + tool comparison + minimal workflow | `@writer` | queued |

## Excluded Issues

| # | Title | Reason |
|---|-------|--------|
| 63 | Adopt Mintlify as new framework | Site re-platforming — infra task, not research/writing |
| 67 | Fix duplicate article titles | Bug fix / layout — not research/writing |

## Operational Requirements per Issue

### #61 — 自動優化專業級提示詞 (research)
- **Skill**: source tracing (Xiaohongshu → repo), open-source project triage, prompt-engineering literacy
- **Inputs**: `http://xhslink.com/o/7iAalKtM6SX`, existing prompt-engineering notes under `content/`
- **Output shape**: research note — project identity, TL;DR, core features, 3+ reusable takeaways, fit-for-inclusion verdict
- **Placement** (pending `@content-ops` review): `content/prompt-notes/` or `content/research-notes/`
- **Agent**: `@writer` (composes `formatting.md`, `quartz.md`)
- **DoD**: confirmed source repo, 3+ reusable takeaways, recommendation paragraph

### #74 — Astron Agent / Serper / Jina AI study note (writing)
- **Skill**: clear role-decomposition writing for mixed audience, pricing clarity
- **Inputs**: user-provided Telegram summary (per issue body)
- **Output shape**: publishable article with title, outline, per-tool role + pricing + official link, workflow-part synthesis
- **Agent**: `@writer`
- **DoD**: single title, unambiguous per-tool positioning, pricing notes, workflow synthesis paragraph

### #75 — LLM raw+wiki knowledge management (research)
- **Skill**: conceptual synthesis, comparison with Karpathy & 林穎俊 references
- **Inputs**: user-provided Chinese script, Facebook reference link
- **Output shape**: learn note — raw vs wiki separation, why it suits personal KM, query+write-back loop
- **Agent**: `@writer`
- **DoD**: clear outline, raw/wiki value articulated, extensibility section

### #76 — n8n AI YouTube automation (research)
- **Skill**: workflow decomposition, tool classification, cost/risk reasoning, PoC scoping
- **Inputs**: YouTube video `5Htbfh_LYSE`
- **Output shape**: study note + categorized tool list + minimal PoC architecture + risk callouts (IP, YT policy, duplicate content)
- **Agent**: `@writer`
- **DoD**: full workflow mapped, each tool category described, 1 viable PoC, risks flagged

### #77 — cmux + Claude Code workflow (research)
- **Skill**: terminal-tooling literacy (tmux/zellij/WezTerm), Claude Code multi-pane patterns, source verification from Xiaohongshu
- **Inputs**: `http://xhslink.com/o/AAbGLpO7BY4`
- **Output shape**: research note — confirm `cmux` identity, compare ≥3 multiplexers, ship 1 minimal workflow
- **Agent**: `@writer`
- **DoD**: tool identity confirmed, comparison table, runnable minimal workflow, scope+limits stated

## Agent Delegation Summary

```
@writer  → #61, #74, #75, #76, #77
@reviewer → post-draft QA on every note before PR merge
@content-ops → taxonomy placement check at PR-review time (folders + tags)
@diagram → on-demand (Mermaid LR) if a workflow diagram adds clarity
```

## Execution Plan (per `cron/git-auto.md` §4)

`git-auto.md` mandates **one issue per branch, one branch per PR, lowest number first**.

1. **This PR** — records the audit and delegation plan on `claude/gracious-hawking-2LrJd`. No content changes.
2. **Next cron run** — picks **#61** (lowest-numbered research/writing issue):
   - `git fetch origin && git checkout -B auto/issue-61 origin/main`
   - Delegate to `@writer`
   - Validate with `npm run quartz -- build`
   - Open PR closing #61
3. **Subsequent runs** — #74 → #75 → #76 → #77, one PR per issue.

## Invariants Observed

- [x] Branched off fresh `origin/main`
- [x] No `.automation/` files staged
- [x] Single-purpose change (audit document only)
- [x] No bundled fixes
