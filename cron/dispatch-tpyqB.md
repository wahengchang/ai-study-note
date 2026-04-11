# Dispatch Brief — tpyqB

**Generated**: 2026-04-11
**Workflow**: [`cron/git-auto.md`](./git-auto.md)
**Purpose**: Audit the open issue queue on `wahengchang/ai-study-note`, filter the research- and writing-shaped items, analyze each item's operational requirements, and delegate to the owning agent in [`claude/agents/`](../claude/agents) so the next automation run can pick the correct issue per §4 of the workflow.

## Queue audit

Open issues fetched on 2026-04-11, sorted by issue number (ascending):

| # | Title | Shape | In scope? |
|---|---|---|---|
| #61 | 研究小紅書：寶藏開源項目，自動優化專業級提示詞 | research | yes — **skip (PR #73 open)** |
| #63 | Adopt Mintlify as new framework for ai-study-note docs site | framework migration | no — architecture decision, not a note |
| #67 | Fix duplicate article titles on ai-study-note pages | layout/bug | no — PR #68 open |
| #74 | Write study note on Astron Agent, Serper, Jina AI, Python node, and LLM | writing | **yes** |
| #75 | Research learn note on LLM-based knowledge management with raw and wiki workflow | research + writing | **yes** |
| #76 | Research AI-powered YouTube automation workflow from n8n video and organize related tools | research + writing | **yes** |
| #77 | Research terminal multiplexing workflow that boosts Claude Code productivity and clarify cmux-related tooling | research + writing | **yes** |

**Filtered queue (actionable, lowest issue number first):** #74, #75, #76, #77.

## Delegation matrix

| Order | Issue | Primary | Support | Pickup |
|---|---|---|---|---|
| 1 | #74 — Astron Agent / Serper / Jina AI / Python node / LLM study note | [`@writer`](../claude/agents/writer.md) | [`@content-ops`](../claude/agents/content-ops.md), [`@reviewer`](../claude/agents/reviewer.md) | **next** |
| 2 | #75 — LLM raw/wiki knowledge-management learn note | [`@writer`](../claude/agents/writer.md) | [`@diagram`](../claude/agents/diagram.md), [`@content-ops`](../claude/agents/content-ops.md), [`@reviewer`](../claude/agents/reviewer.md) | queued |
| 3 | #76 — n8n AI YouTube automation workflow research | [`@writer`](../claude/agents/writer.md) | [`@diagram`](../claude/agents/diagram.md), [`@content-ops`](../claude/agents/content-ops.md), [`@reviewer`](../claude/agents/reviewer.md) | queued |
| 4 | #77 — cmux × Claude Code terminal multiplexing research | [`@writer`](../claude/agents/writer.md) | [`@content-ops`](../claude/agents/content-ops.md), [`@reviewer`](../claude/agents/reviewer.md) | queued (source verification gate) |

Per [`cron/git-auto.md`](./git-auto.md) §4, each run picks **one issue, lowest number first**, skipping anything already held by an open PR. #61 is held by PR #73, so the next actionable pickup is **#74**.

## Operational analysis

### #74 — Astron Agent / Serper / Jina AI / Python node / LLM study note

- **Skill shape**: pure writing. The issue body already supplies the source material (one-line positioning, pricing notes, official links). No external research is required before drafting.
- **Primary — `@writer`**: produce a zh-tw note under `content/` using the Writer template; classify intent as **Architect** (workflow-parts explainer, not a debug or deploy runbook). Make the "這是同一條 workflow 的不同零件，不是同一個 AI 工具" distinction load-bearing, and include the free-tier vs paid-tier breakdown called out in 驗收條件. Keep one plain-language subsection per 建議文章方向.
- **Support — `@content-ops` (Intake mode)**: walk `docs/content-taxonomy.md` §5 to place the note. Likely destinations are `content/prompt-notes/` or an AI-workflow tooling folder. Stop-and-ask if ambiguous — never invent a folder or tag.
- **Support — `@reviewer`**: enforce that each tool's role, pricing, and official link is unambiguous; block on vague terminology; verify `npm run quartz -- build` exits 0.
- **Deliverables**: one note + any affected `index.md` after placement.

### #75 — LLM raw/wiki knowledge-management learn note

- **Skill shape**: conceptual research synthesis + writing. Must preserve the raw/wiki two-layer separation as the anchor idea and credit Andrej Karpathy + 林穎俊 as the references.
- **Primary — `@writer`**: classify intent as **Architect**. Walk the raw → AI synthesis → wiki → query → write-back loop in prose, grounded in the user's own IDE + Obsidian + Markdown + Git stack. Flag any claim outside the source material with `> [!warning]`.
- **Support — `@diagram`**: one `flowchart LR` (4–6 nodes max) for the raw/wiki feedback loop. Apply the dark-theme `classDef` tokens from `claude/agents/diagram.md`; never `TD`.
- **Support — `@content-ops` (Intake mode)**: classify into the learn-note folder per taxonomy; propose filename and tags, wait for confirmation.
- **Support — `@reviewer`**: raw vs wiki roles must never be conflated; Karpathy / 林穎俊 attributions must resolve to real sources.

### #76 — n8n AI YouTube automation workflow research

- **Skill shape**: largest scope. Requires video walkthrough, six-category tool inventory, PoC architecture proposal, and risk / platform-policy analysis.
- **Primary — `@writer`**: classify intent as **Architect**. Structure around the four sections in the issue (workflow tear-down, tool inventory, research priorities, deliverables). Keep the tool table scannable — one row per tool with purpose / strengths / limits. Call out the 中文 / 繁中 workflow suitability question explicitly.
- **Support — `@diagram`**: single `flowchart LR` covering the end-to-end pipeline stages (題材 → 腳本 → 視覺 → 音訊 → 組裝 → 發布 → 回寫). Collapse sub-tools into labels; keep to ≤6 core nodes.
- **Support — `@content-ops` (Intake mode)**: place under the automation/research folder per taxonomy; stop-and-ask if the existing taxonomy offers no home.
- **Support — `@reviewer`**: **must** flag YouTube ToS, copyright, duplicate-content, and spam-policy risks per 驗收條件. Verify the PoC section is reproducible rather than hand-wavy.

### #77 — cmux × Claude Code terminal multiplexing research

- **Skill shape**: source verification first, then comparative research + writing. The 小紅書 source is truncated, so `cmux`'s identity must be confirmed before drafting.
- **Primary — `@writer`**: classify intent as **Architect**. Lead with a "source verification" section recording the resolved identity of `cmux` (evidence-based, per Writer agent rule 1). Follow with a comparison matrix (cmux / tmux / zellij / WezTerm mux) and a minimal Claude Code pane workflow (agent / logs / edit-git-test / long-running monitor).
- **Support — `@content-ops` (Intake mode)**: propose placement under the Claude Code / terminal workflow folder per taxonomy.
- **Support — `@reviewer`**: balance the comparison, make applicability and limits explicit, and demand citations for any productivity claim (including the "3x efficiency" headline).
- **Gate**: if source verification fails, `@writer` must flag with `> [!warning]` and [`cron/git-auto.md`](./git-auto.md) §4 routes the issue to `clarification_needed`.

## Cross-cutting operational rules

- **Language**: zh-tw per repo convention (opening line of `cron/git-auto.md`).
- **Frontmatter**: every note requires `title`; `@content-ops` enforces the full `title` + `description` + `tags` schema from `docs/content-taxonomy.md`.
- **Mermaid**: `direction LR` only; apply the dark-theme `classDef` tokens from `claude/agents/diagram.md`.
- **Build gate**: `@reviewer` blocks merge until `npm run quartz -- build` exits 0.
- **Branching**: each downstream implementation PR uses `auto/issue-<n>` branched fresh from `origin/main`, per `cron/git-auto.md` §4b. This dispatch PR itself implements no issue.
- **Staging discipline**: explicit-path staging only. Never `git add .`, never touch `.automation/`.

## Next run pickup

Per `cron/git-auto.md` §4 and §5, the next automation run must:

1. Re-run preflight: clean working tree + `git fetch origin`.
2. Skip #61 (PR #73 open).
3. Pick **#74** — branch `auto/issue-74` fresh off `origin/main`, delegate to `@writer` → `@content-ops` → `@reviewer`, open exactly one PR.
4. Stop. Do not bundle #75–#77 into the same run.
