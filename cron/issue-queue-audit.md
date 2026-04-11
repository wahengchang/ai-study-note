# Issue Queue Audit — Research & Writing Delegation Plan

> Generated: 2026-04-11
> Scope: Open issues in `wahengchang/ai-study-note`
> Workflow: [`cron/git-auto.md`](./git-auto.md) — one issue per run, lowest number first
> Agents: `claude/agents/{writer,reviewer,diagram,content-ops}.md`

## 1. Queue snapshot

| # | Title | Labels | In scope? | Reason |
|---|---|---|---|---|
| 77 | Research terminal multiplexing workflow (cmux × Claude Code) | documentation, enhancement | YES | Research → note |
| 76 | Research AI-powered YouTube automation workflow (n8n video) | documentation, enhancement | YES | Research → note |
| 75 | Research learn note on LLM-based knowledge management (raw/wiki) | documentation, enhancement | YES | Research → note |
| 74 | Write study note on Astron Agent, Serper, Jina AI, Python node, LLM | documentation, enhancement | YES | Writing from existing material |
| 67 | Fix duplicate article titles on ai-study-note pages | — | NO | Bug fix / template logic |
| 63 | Adopt Mintlify as new framework for ai-study-note docs site | enhancement | NO | Framework migration, not a note |
| 61 | (Research) 小紅書：寶藏開源項目，自動優化專業級提示詞 | — | YES | Research → note |

**Filtered research & writing queue (in priority order per `git-auto.md`):**

1. **#61** — Prompt-optimizer open source project research
2. **#74** — Astron Agent / Serper / Jina AI / Python / LLM study note
3. **#75** — LLM knowledge management (raw/wiki) learn note
4. **#76** — n8n AI YouTube automation workflow research
5. **#77** — cmux terminal multiplexing for Claude Code research

## 2. Operational requirements per issue

### #61 — 小紅書 prompt optimizer project research

- **Intent**: Research (investigate → summarize → decide)
- **Inputs**: 小紅書 link `http://xhslink.com/o/7iAalKtM6SX`, unknown open source project name
- **Unknowns**: Project identity, repo URL, feature surface
- **Deliverables**: project name + repo, 3–5 line TL;DR, core features, use cases, adoption recommendation
- **Primary skills**: web research, source chasing, tool evaluation, concise note authoring
- **Risks**: Original post may be behind app-wall; may need cross-source verification
- **Target path**: `content/prompt-notes/<kebab-case-project>.md`

### #74 — Astron Agent / Serper / Jina AI / Python node / LLM study note

- **Intent**: Writing (synthesize provided material → publishable note)
- **Inputs**: User-supplied Telegram summary covering role, pricing, official links of each component
- **Unknowns**: Minimal — source material exists; needs verification + structure
- **Deliverables**: titled article, outline/draft, per-tool positioning table, pricing clarity, workflow role summary
- **Primary skills**: technical writing, taxonomy, comparison table formatting
- **Risks**: Avoid conflating model vs platform vs logic node; must stay faithful to source
- **Target path**: `content/claude-code/ai-workflow-building-blocks.md` (or equivalent under existing topic folder)

### #75 — LLM knowledge management (raw / wiki) learn note

- **Intent**: Research + writing (concept note from existing script)
- **Inputs**: User-supplied Chinese narration, Karpathy / 林穎俊 references, raw ↔ wiki design
- **Unknowns**: Reference-source exact citations
- **Deliverables**: outline or draft covering raw/wiki separation, AI-driven structuring, query loop, knowledge reinforcement
- **Primary skills**: conceptual writing, information architecture, diagram (raw → wiki flow)
- **Risks**: Must avoid product-level implementation scope creep
- **Target path**: `content/claude-code/llm-knowledge-management-raw-wiki.md`

### #76 — n8n AI YouTube automation workflow research

- **Intent**: Research (deep tool inventory + workflow decomposition)
- **Inputs**: YouTube video `5Htbfh_LYSE`, prebuilt tool list across 6 workflow stages
- **Unknowns**: Accurate tool role mapping, API cost structure, CN workflow fit
- **Deliverables**: study note with workflow decomposition, tool taxonomy, min-viable PoC, risk section (copyright / YouTube policy)
- **Primary skills**: research synthesis, tool categorization, workflow diagram, risk analysis
- **Risks**: Large surface area — must bound scope to research note, not tutorial
- **Target path**: `content/seo-and-geo/n8n-ai-youtube-automation-workflow.md`

### #77 — cmux terminal multiplexing × Claude Code research

- **Intent**: Research (verify claim, compare tools, output workflow)
- **Inputs**: 小紅書 link, claim of 3× productivity via `cmux`
- **Unknowns**: Whether `cmux` refers to well-known project or niche tool; comparison set
- **Deliverables**: research note with tool identity, comparison table (cmux / tmux / zellij / WezTerm mux), Claude Code multi-pane workflow recipe
- **Primary skills**: source verification, tool comparison, workflow authoring
- **Risks**: Risk of misidentifying `cmux`; must verify source before writing
- **Target path**: `content/claude-code/terminal-multiplexing-workflow.md`

## 3. Agent delegation matrix

| Issue | Primary agent | Supporting agents | Rationale |
|---|---|---|---|
| #61 | `@writer` | `@content-ops` (placement/tags), `@reviewer` (final pass) | Research → concise note; writer handles both verification and authoring |
| #74 | `@writer` | `@content-ops` (taxonomy), `@reviewer` | Source material exists; writing & structure are primary skill |
| #75 | `@writer` | `@diagram` (raw → wiki flow), `@content-ops`, `@reviewer` | Conceptual note benefits from one LR flowchart |
| #76 | `@writer` | `@diagram` (end-to-end workflow), `@content-ops`, `@reviewer` | Multi-stage workflow needs visualization |
| #77 | `@writer` | `@content-ops`, `@reviewer` | Research + comparison table; diagram optional |

**Notes**

- `@writer` is the default primary for every research/writing issue per the agent role in `claude/agents/writer.md` ("Convert hands-on experiments ... into lean Quartz Markdown notes").
- `@diagram` is invoked only where visualization adds clarity (per `CLAUDE.md` Mermaid rule and diagram-agent checklist).
- `@content-ops` is always invoked post-draft in **Intake** mode to confirm folder + tags against `docs/content-taxonomy.md`.
- `@reviewer` runs as the last gate before PR merge on each issue branch.

## 4. Execution workflow

This audit initiates the loop defined in [`cron/git-auto.md`](./git-auto.md):

```text
per run (lowest issue number first):
  preflight  → fetch origin, verify clean tree
  pick next  → #61 → #74 → #75 → #76 → #77
  branch     → auto/issue-<n> from origin/main
  delegate   → primary agent (+ supporting as per matrix)
  validate   → npm run quartz -- build
  commit     → explicit paths only; never .automation/
  push + PR  → one PR per issue
```

### Run order

1. **Run 1** → Issue #61 → `auto/issue-61` → `@writer`
2. **Run 2** → Issue #74 → `auto/issue-74` → `@writer`
3. **Run 3** → Issue #75 → `auto/issue-75` → `@writer` + `@diagram`
4. **Run 4** → Issue #76 → `auto/issue-76` → `@writer` + `@diagram`
5. **Run 5** → Issue #77 → `auto/issue-77` → `@writer`

## 5. Out-of-scope issues (for visibility only)

- **#67** — Layout/template bug; routes to standard engineering workflow, not a note-writing agent.
- **#63** — Framework migration evaluation; needs architectural decision, not a research note.
