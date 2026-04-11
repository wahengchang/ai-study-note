# Dispatch Brief — 5K9fk

**Generated**: 2026-04-11
**Workflow**: [`cron/git-auto.md`](./git-auto.md)
**Purpose**: Audit the open issue queue, filter research/writing work, analyze operational requirements, and delegate each item to the owning agent in [`claude/agents/`](../claude/agents).

## Queue audit

Open issues fetched from `wahengchang/ai-study-note` (sorted by issue number, ascending):

| # | Title | Shape | In scope? |
|---|---|---|---|
| #61 | 研究小紅書：寶藏開源項目，自動優化專業級提示詞 | research | yes — **skip (PR #73 open)** |
| #63 | Adopt Mintlify as new framework for ai-study-note docs site | framework migration | no — architecture decision |
| #67 | Fix duplicate article titles on ai-study-note pages | layout/bug | no — PR #68 open |
| #74 | Write study note on Astron Agent, Serper, Jina AI, Python node, and LLM | writing | **yes** |
| #75 | Research learn note on LLM-based knowledge management with raw and wiki workflow | research + writing | **yes** |
| #76 | Research AI-powered YouTube automation workflow from n8n video and organize related tools | research + writing | **yes** |
| #77 | Research terminal multiplexing workflow that boosts Claude Code productivity and clarify cmux-related tooling | research + writing | **yes** |

**Filtered queue (actionable, lowest issue number first):** #74, #75, #76, #77.

## Delegation matrix

| Order | Issue | Primary | Support | Pickup status |
|---|---|---|---|---|
| 1 | #74 — Astron Agent / Serper / Jina AI study note | `@writer` | `@content-ops`, `@reviewer` | ready |
| 2 | #75 — LLM raw/wiki knowledge management learn note | `@writer` | `@diagram`, `@content-ops`, `@reviewer` | ready |
| 3 | #76 — n8n AI YouTube automation workflow research | `@writer` | `@diagram`, `@content-ops`, `@reviewer` | ready |
| 4 | #77 — cmux × Claude Code terminal multiplexing research | `@writer` | `@content-ops`, `@reviewer` | ready |

Per [`cron/git-auto.md`](./git-auto.md) §4, subsequent runs pick **one issue per run, lowest number first, skipping issues that already have an open PR**. With #61 held by PR #73, the next actionable pickup is **#74**.

## Operational analysis

### #74 — Astron Agent / Serper / Jina AI / Python node / LLM study note
- **Skill shape**: pure writing. Source material is already supplied in the issue body; no external research required.
- **Primary — `@writer`**: produce a zh-tw `content/` note using the Writer template, classify intent as **Architect** (workflow-parts explainer, not a debug/deploy runbook). Make the "different components of the same workflow, not a single AI tool" distinction explicit, and include the free-tier vs paid-tier breakdown requested in 驗收條件.
- **Support — `@content-ops` (Intake mode)**: walk taxonomy §5 to place the note; probable destinations are `content/prompt-notes/` or a tooling-comparison folder. Stop and ask if ambiguous — do not invent a new folder.
- **Support — `@reviewer`**: enforce that each tool's role, pricing, and official link is clearly scoped; verify no vague terminology and that `npm run quartz -- build` passes.
- **Deliverables**: one note + updated folder `index.md` if `@content-ops` moves it.

### #75 — LLM raw/wiki knowledge-management learn note
- **Skill shape**: conceptual research synthesis + writing. Must preserve the raw/wiki two-layer separation as the anchor idea, crediting Karpathy and 林穎俊 as references.
- **Primary — `@writer`**: classify intent as **Architect**. Show the raw → AI synthesis → wiki → query → write-back loop in prose with concrete examples drawn from the user's own Obsidian + Markdown + Git stack.
- **Support — `@diagram`**: one `flowchart LR` (4–6 nodes max) illustrating the raw/wiki feedback loop. Apply project dark-theme `classDef` tokens; never `TD`.
- **Support — `@content-ops` (Intake mode)**: classify into the learn-note folder per taxonomy; propose filename and tags, wait for confirmation.
- **Support — `@reviewer`**: check that raw vs wiki roles are never conflated and that the Karpathy / 林穎俊 attributions resolve to real sources.

### #76 — n8n AI YouTube automation workflow research
- **Skill shape**: largest scope. Requires video walkthrough, tool inventory across 6 categories, PoC architecture proposal, and risk/policy analysis.
- **Primary — `@writer`**: classify intent as **Architect**. Structure around the four sections the issue specifies (workflow tear-down, tool inventory, research priorities, deliverables). Keep the tool table scannable — one row per tool with purpose / strengths / limits.
- **Support — `@diagram`**: single `flowchart LR` covering the end-to-end pipeline stages (題材 → 腳本 → 視覺 → 音訊 → 組裝 → 發布 → 回寫). Collapse sub-tools into labels; keep to 6 core nodes.
- **Support — `@content-ops` (Intake mode)**: place under the automation/research folder per taxonomy; flag if the existing taxonomy has no home and stop-and-ask rather than invent one.
- **Support — `@reviewer`**: **must** flag YouTube Terms of Service, copyright, and spam-policy risks per 驗收條件. Verify PoC section is reproducible and not hand-wavy.

### #77 — cmux × Claude Code terminal multiplexing research
- **Skill shape**: source verification first, then comparative research + writing. The 小紅書 source is truncated, so the identity of `cmux` must be confirmed before drafting.
- **Primary — `@writer`**: classify intent as **Architect**. Begin with a "source verification" section recording the resolved identity of `cmux` (evidence-based, per writer agent rule 1). Follow with the comparison matrix (cmux / tmux / zellij / WezTerm mux) and a minimal Claude Code pane workflow.
- **Support — `@content-ops` (Intake mode)**: propose placement under the Claude Code / terminal workflow folder per taxonomy.
- **Support — `@reviewer`**: ensure the comparison is balanced and applicability/limits are explicit; demand citations for any performance or productivity claim.
- **Note**: if source verification fails (`cmux` identity cannot be resolved from the 小紅書 link), `@writer` must flag as `> [!warning]` and `cron/git-auto.md` §4 routes this to `clarification_needed`.

## Cross-cutting operational rules

- **Language**: zh-tw per repo convention (`cron/git-auto.md` opening line).
- **Frontmatter**: every note requires `title`; `@content-ops` enforces the full `title` + `description` + `tags` schema from `docs/content-taxonomy.md`.
- **Mermaid**: `direction LR` only; apply the dark-theme `classDef` tokens from `claude/agents/diagram.md`.
- **Build gate**: `@reviewer` blocks merge until `npm run quartz -- build` exits 0.
- **Branching**: each downstream implementation PR uses `auto/issue-<n>` branched fresh from `origin/main`, per `cron/git-auto.md` §4b. This dispatch PR does not itself implement any issue.
- **Staging discipline**: explicit-path staging only. Never `git add .` or touch `.automation/`.

## Next run pickup

Per `cron/git-auto.md` §4 and §5, the next automation run should:

1. Re-run preflight (clean tree, `git fetch origin`).
2. Skip #61 (PR #73 open).
3. Pick **#74** — branch `auto/issue-74` off fresh `origin/main`, delegate to `@writer` → `@content-ops` → `@reviewer`, open one PR.
4. Stop. Do not bundle #75–#77 into the same run.
