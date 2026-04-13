# Task Queue — Research & Writing Delegation

> Generated: 2026-04-13
> Source: Open issues in `wahengchang/ai-study-note`
> Workflow: Consumed by [`./git-auto.md`](./git-auto.md) — one issue per run, lowest number first.

## Audit Summary

| Stat | Value |
|---|---|
| Total open issues | 7 |
| Research / Writing tasks | 6 |
| Excluded (non-content) | 1 |

Excluded: `#67 Fix duplicate article titles` — layout/bug fix, not a research or writing task. Defer to a dev/content-ops pass outside this queue.

## Filtered Queue (execution order)

Ordered by issue number ascending per the `git-auto.md` invariant ("lowest number first").

| # | Issue | Primary Agent | Supporting | Type | Target Path |
|---|---|---|---|---|---|
| 1 | #61 — Research 小紅書 prompt auto-optimizer | `@writer` | `@reviewer` | research | `content/prompt-notes/<kebab-case>.md` |
| 2 | #63 — Adopt Mintlify as docs framework | `@writer` | `@reviewer` | research | `content/setup-env/<kebab-case>.md` |
| 3 | #74 — Study note: Astron Agent / Serper / Jina / Python node / LLM | `@writer` | `@reviewer` | write | `content/prompt-notes/<kebab-case>.md` |
| 4 | #75 — Learn note: LLM-based raw/wiki knowledge management | `@writer` | `@diagram`, `@reviewer` | research + write | `content/prompt-notes/<kebab-case>.md` |
| 5 | #76 — Research: n8n AI YouTube automation workflow | `@writer` | `@diagram`, `@reviewer` | research | `content/prompt-notes/<kebab-case>.md` |
| 6 | #77 — Research: cmux / terminal multiplexing for Claude Code | `@writer` | `@reviewer` | research | `content/claude-code/<kebab-case>.md` |

## Per-Issue Operational Requirements

### #61 — 小紅書 prompt auto-optimizer (research)

- **Agent**: `@writer` (research mode) → `@reviewer`
- **Inputs**: XHS link `http://xhslink.com/o/7iAalKtM6SX`
- **Deliverable**: research summary note (TL;DR, core features, 3+ reusable takeaways, inclusion verdict)
- **Prompts composed**: `formatting.md`, `quartz.md`
- **Acceptance**: confirms upstream repo/project, ≥3 reusable points, clear "include-in-notes?" conclusion

### #63 — Mintlify framework adoption (research)

- **Agent**: `@writer` (research mode) → `@reviewer`
- **Inputs**: reference site `https://agentskills.io/home`, current Quartz stack
- **Deliverable**: framework evaluation note — stack breakdown, migration cost, decision matrix
- **Scope guard**: **no site rebuild**. Research + decision doc only.
- **Acceptance**: explicit "adopt / defer / reject" recommendation with reasoning

### #74 — Astron Agent / Serper / Jina / Python / LLM (writing)

- **Agent**: `@writer` (write mode) → `@reviewer`
- **Inputs**: user's Telegram draft (tool roles, pricing tiers, official links)
- **Deliverable**: publishable study note — each component's role, pricing tier, workflow placement
- **Prompts composed**: `formatting.md`, `mermaid.md`, `quartz.md`
- **Acceptance**: each tool role distinct, pricing labeled, workflow-parts framing (not "one AI tool")

### #75 — Raw/Wiki LLM knowledge management (research + write)

- **Agent**: `@writer` → `@diagram` (LR flowchart of raw→wiki loop) → `@reviewer`
- **Inputs**: Andrej Karpathy and 林穎俊 references, user's narration draft
- **Deliverable**: learn-note outline + draft separating raw (immutable) and wiki (evolving) layers
- **Prompts composed**: `formatting.md`, `mermaid.md`, `quartz.md`
- **Acceptance**: raw/wiki value articulated, extensible framework for public notes

### #76 — n8n AI YouTube automation (research)

- **Agent**: `@writer` → `@diagram` (end-to-end workflow LR) → `@reviewer`
- **Inputs**: YouTube `https://www.youtube.com/watch?v=5Htbfh_LYSE`
- **Deliverable**: workflow breakdown + tool classification + PoC architecture sketch + risk section (copyright, YT policy, duplicate content)
- **Acceptance**: full workflow mapped, each tool class has purpose/limit, ≥1 landable PoC

### #77 — cmux / terminal multiplexing for Claude Code (research)

- **Agent**: `@writer` → `@reviewer`
- **Inputs**: XHS link `http://xhslink.com/o/AAbGLpO7BY4`
- **Deliverable**: research note identifying actual `cmux` project, comparison vs tmux/zellij/WezTerm, recommended Claude Code pane layout
- **Acceptance**: upstream tool identity confirmed, ≥3 tools compared, ≥1 actionable workflow

## Execution Rules (inherited from `cron/git-auto.md`)

- One issue per branch: `auto/issue-<n>`, branched fresh from `origin/main` each run.
- Mark tracker `in_progress` **before** work begins; `pr_open` on success, `failed` on validation break.
- Stage by explicit path only — never `git add .` or `git add -A`.
- `.automation/` is local state; never commit.
- Validation gate: `npm run quartz -- build` must exit 0 before pushing.
- Never bundle unrelated fixes into an issue branch.

## Hand-off

Next run of `cron/git-auto.md` picks **#61** (lowest number) and delegates to `@writer`. Subsequent runs advance down the table in order.
