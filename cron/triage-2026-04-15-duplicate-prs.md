# Triage — 2026-04-15 (duplicate-PR conflict)

`cron/git-auto.md` audit tick. Working tree verified clean; branch at `origin/main`
(`155880d`). No new issue branch opened this run — every research/writing issue
already has at least one open PR (most have two).

## Issue queue — filtered to research / writing

| # | Title | Type | Open PR(s) |
|---|-------|------|-----------|
| #61 | 小紅書 — OSS prompt optimizer | Research | #73, #165 |
| #74 | Astron Agent / Serper / Jina AI / Python node / LLM | Writing | #164, **#169** |
| #75 | raw/wiki LLM knowledge management | Research + Writing | #156 |
| #76 | n8n AI YouTube automation | Research + Writing | #154 |
| #77 | Terminal multiplexing × Claude Code (`cmux`) | Research + Writing | #166, **#170** |

Excluded: **#67** — duplicate-H1 layout bug, `@content-ops` lane; already has
PR #68 (not research/writing).

## Invariant violation detected

`cron/git-auto.md` §Invariants: *"One issue per branch, one branch per PR."*

Two issues currently have competing branches:

| Issue | Original PR (branch) | Duplicate PR (branch) | Action |
|-------|----------------------|----------------------|--------|
| #74 | #164 (`auto/issue-74`) | #169 (`auto/issue-74`, force-push?) | Keep #164; investigate #169 before closing |
| #77 | #166 (`claude/gracious-hawking-BSZnQ`) | #170 (`auto/issue-77`) | Keep whichever has the better note; close the other |

Neither run this tick deleted or replaced the other — this must be resolved by
the user or a dedicated reconciliation tick before any new work on #74 / #77.

## Operational requirements per filtered issue

| # | Inputs in body | Ops | External lookups | Key risks |
|---|----------------|-----|------------------|-----------|
| #61 | `xhslink` (login-walled) | S | Source attribution | Source unverifiable → `clarification_needed` (already commented) |
| #74 | Tool list + positioning + pricing | S | Verify official URLs | Duplicate PR conflict (#164 vs #169) |
| #75 | FB share + zh-TW transcript | M | Karpathy / 林穎俊 refs | Overlap w/ `karpathy-llm-wiki-pattern.md` |
| #76 | Full workflow spec + tool taxonomy | L | Pricing across 10+ SaaS | Pricing drift + YouTube policy |
| #77 | `xhslink` + `cmux` keyword | M | Identify project behind `cmux` | Source ambiguity + duplicate PR conflict (#166 vs #170) |

Ops key: **S** = single note, body has everything · **M** = need ≤3 external
lookups · **L** = need broad survey + cross-tool comparison.

## Agent delegation (from `claude/config.yaml`)

| # | Primary | Secondary | Why |
|---|---------|-----------|-----|
| #61 | `@writer` | `@reviewer` | Source attribution requires evidence audit |
| #74 | `@writer` | `@reviewer` | Pricing claims need verification |
| #75 | `@writer` | `@diagram` | raw → wiki loop benefits from `flowchart LR` |
| #76 | `@writer` | `@diagram`, `@reviewer` | 7-stage pipeline + policy-risk claims |
| #77 | `@writer` | `@diagram` | 4-pane workflow benefits from `flowchart LR` |

`@writer` is primary on all five — each issue terminates in a Quartz-publishable
note, which is the agent's core composition (`formatting.md` + `mermaid.md` +
`quartz.md`).

## Next-tick recommendation (per `cron/git-auto.md` §3)

1. **Resolve duplicate-PR conflicts first** — #74 (#164 vs #169) and #77 (#166
   vs #170). Do not open any new branch for these issues until the conflicts
   are resolved, per the one-branch-per-issue invariant.
2. **Process PR-side updates on the remaining singles** — #154, #156, #164,
   #166 — check for new comments / base drift and rebase on `origin/main` if
   stale.
3. **#61 stays blocked** on user clarification (xhslink login wall + source
   identity).
4. **Do not open a competing PR** for any filtered issue this tick.

## Invariants honored this tick

- [x] `.automation/` never staged — `git diff --cached --stat` shows only this
      triage doc.
- [x] Working tree verified clean before write (`git status --porcelain` empty).
- [x] Explicit-path staging only — no `git add .` / `git add -A`.
- [x] No new `auto/issue-<n>` branch opened — queue saturated, skip per §4.
- [x] One branch, one PR for this triage record.

Initiates the next `cron/git-auto.md` execution cycle.
