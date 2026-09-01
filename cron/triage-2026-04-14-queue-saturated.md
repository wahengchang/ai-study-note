# Issue Queue Triage — 2026-04-14

> Run type: `cron/git-auto.md` audit-only pass.
> Result: **queue saturated** — every research/writing issue already has an open PR.

## Audit scope

- Source: `mcp__github__list_issues` (state: `OPEN`) against `wahengchang/ai-study-note`
- Date: 2026-04-14
- Open issues scanned: **6**

## Filter — research / writing only

Excluded non-research/writing tasks up front:

| # | Title | Why excluded |
|---|-------|--------------|
| #67 | Fix duplicate article titles | Layout/content-rule bug — belongs to `@content-ops` lane; already covered by merged-scope PR #68. |

Remaining filtered set: **#61, #74, #75, #76, #77** (5 issues).

## Delegation map (grounded in `claude/config.yaml`)

| # | Deliverable type | Primary agent | Secondary | Why this agent |
|---|------------------|---------------|-----------|----------------|
| #61 | Research note on OSS prompt optimizer | `@writer` | `@reviewer` | Composition of `formatting.md` + `mermaid.md` + `quartz.md`; no diagram-heavy requirement. |
| #74 | Study note on Astron Agent / Serper / Jina AI / Python node / LLM | `@writer` | `@reviewer` | Pure composition — issue body already ships tool list, positioning, pricing. |
| #75 | Learn note on raw/wiki LLM knowledge system | `@writer` | `@diagram` | Needs raw↔wiki flow diagram (LR) + narrative on query-writeback loop. |
| #76 | Research note on n8n AI YouTube automation | `@writer` | `@diagram`, `@reviewer` | 7-stage pipeline + tool matrix + risk section; large scope → reviewer gate. |
| #77 | Research note on terminal multiplexing × Claude Code | `@writer` | `@diagram` | Pane-layout diagram + tool comparison table; source ambiguity flagged in-note. |

## Operational requirements per filtered issue

| # | Inputs available | Ops complexity | External lookups | Key risks |
|---|------------------|----------------|------------------|-----------|
| #61 | xhslink URL (login-walled) | S | Source attribution | Source unverifiable — already marked `clarification_needed`. |
| #74 | Tool list + one-line positioning + pricing concepts in body | S | Verify official URLs only | Low. |
| #75 | FB share + zh-TW transcript | M | Karpathy / 林穎俊 references | Overlap with existing `karpathy-llm-wiki-pattern.md` — needs differentiation. |
| #76 | Full workflow spec + tool taxonomy in body | L | Pricing across 10+ SaaS tools | Pricing drift; YouTube policy risk must be documented. |
| #77 | xhslink URL + `cmux` keyword | M | Identify project behind `cmux` | Same login-wall as #61; source ambiguity. |

## PR coverage — all filtered issues already have open PRs

| # | Open PR(s) | Head branch | Status |
|---|-----------|-------------|--------|
| #61 | #73, #165 | `auto/issue-61`, `claude/gracious-hawking-eaZCW` | Awaiting review / user clarification |
| #74 | #164 | `claude/gracious-hawking-JLeht` | Awaiting review |
| #75 | #156 | `claude/gracious-hawking-emWMw` | Awaiting review |
| #76 | #154 | `claude/gracious-hawking-XbwFu` | Awaiting review |
| #77 | #166 | `claude/gracious-hawking-BSZnQ` | Awaiting review |

Per `cron/git-auto.md` §4: *"If issue already has an open PR, skip it."* No new issue branch is opened this run.

## Fresh guidance captured from issue comments (2026-04-14)

The user posted implementation-approach comments on #74, #76, #77 at `2026-04-14T23:02Z`. Summaries:

- **#74** — Frame as "這不是 5 個 AI 工具，而是 5 種 workflow 零件"; uniform per-component schema (role / type / pricing / link); end-to-end flow diagram. Non-technical first.
- **#76** — Mark each pipeline step as no-code / low-code-glue / engineering-heavy. Dedicated risk section: copyright, low-value content, YouTube reused-content policy, API cost creep. Close with one minimal zh-TW PoC.
- **#77** — Source-verify `cmux` first; if still ambiguous, write ambiguity explicitly. Compare tmux / zellij / WezTerm mux / actual `cmux`. Anchor on 4-pane Claude Code use case. End with a 10–15 min minimum viable setup. Lede: *"terminal multiplexing does not make Claude Code smarter; it reduces context switching and makes long-running agent work easier to supervise."*

Existing PRs **#164 / #154 / #166** should be cross-checked against these guidance comments; if any landed before the comments, the next `git-auto` tick can push a follow-up commit on the same head branch (per §3 rule: "If a PR has new comments/review comments, checkout that PR branch and update it in place").

## Next-tick recommendation (per `cron/git-auto.md` §3)

1. **Process PR-side updates first** before opening new issue branches:
   - #164 (#74), #154 (#76), #166 (#77) — compare content to the 2026-04-14T23:02Z guidance comments; push a follow-up commit if any recommendation is missing.
   - #156 (#75), #73/#165 (#61) — no new guidance comment; review-response only.
2. **Do not open a competing PR for any filtered issue** — invariant: one branch per PR per issue.
3. **#61 remains blocked** on user clarification (source identity of the xhslink post).

## Invariants honored this run

- [x] `.automation/` never staged (none present; single file at `cron/triage-2026-04-14-queue-saturated.md`)
- [x] Working tree verified clean before write (`git status --porcelain` empty)
- [x] Explicit-path staging only
- [x] No new issue branch opened — queue saturated, skip per §4
- [x] One branch, one PR for this triage record
