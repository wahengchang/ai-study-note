# Issue Queue Triage — Research & Writing Tasks

Audit of the open issue queue filtered to research/writing work only.
Each entry maps operational requirements to the agent from `claude/config.yaml`
best suited to execute it. Execution follows `./cron/git-auto.md` — one issue
per branch, lowest number first, branched fresh from `origin/main`.

## Scope filter

| # | Title | Category | Included |
|---|-------|----------|----------|
| 77 | Research cmux terminal multiplexing + Claude Code | Research | Yes |
| 76 | Research AI-powered YouTube automation (n8n) | Research | Yes |
| 75 | Research LLM-based knowledge management (raw/wiki) | Research | Yes |
| 74 | Write study note — Astron Agent, Serper, Jina, Python node, LLM | Writing | Yes |
| 67 | Fix duplicate article titles on pages | Bug fix | No — out of scope |
| 61 | Research 寶藏開源項目 — auto prompt optimization | Research | Yes |

## Delegation map

All included issues deliver a Quartz-publishable study/research note. The
`@writer` agent composes `formatting.md` + `mermaid.md` + `quartz.md` prompt
fragments and is the primary executor. Diagram-heavy or content-organisation
sub-steps are delegated as noted.

### #61 — 寶藏開源項目 prompt optimization research
- **Primary agent:** `@writer`
- **Operational requirements:**
  - Resolve the Xiaohongshu link to the actual open-source repo/project.
  - Produce: project TL;DR (3–5 lines), core features, 3+ reusable takeaways,
    fit-for-ai-study-note verdict.
  - Place under `content/` with `title` frontmatter and kebab-case filename.
- **Supporting agents:** `@reviewer` for final QA.

### #74 — Astron Agent / Serper / Jina / Python node / LLM study note
- **Primary agent:** `@writer`
- **Operational requirements:**
  - Article draft clarifying each component's role in an AI workflow
    (model vs. tool vs. platform vs. logic node).
  - Cover pricing tier (free / free quota / paid), official links.
  - Include a plain-language section for non-technical readers.
  - Optional workflow diagram — delegate to `@diagram` (LR orientation only).
- **Supporting agents:** `@diagram`, `@reviewer`.

### #75 — LLM knowledge management (raw/wiki) learn note
- **Primary agent:** `@writer`
- **Operational requirements:**
  - Note framing the two-layer raw/wiki design (raw = immutable source,
    wiki = evolving synthesis).
  - Reference Andrej Karpathy / 林穎俊 approaches; keep low-barrier stack
    (IDE + Obsidian + Markdown + Git).
  - Deliver outline + draft, not production architecture.
- **Supporting agents:** `@diagram` (optional flow diagram), `@reviewer`.

### #76 — n8n AI YouTube automation research
- **Primary agent:** `@writer`
- **Operational requirements:**
  - Decompose the referenced video's end-to-end workflow.
  - Tool inventory by category (orchestration, LLM, visual, audio, rendering,
    publishing, storage/notification).
  - Deliverables: study note, categorised tool list, minimal PoC sketch.
  - Explicitly flag risks: content quality, copyright, duplicate content,
    YouTube policy.
- **Supporting agents:** `@diagram` for PoC architecture sketch, `@reviewer`.

### #77 — cmux / terminal multiplexing + Claude Code research
- **Primary agent:** `@writer`
- **Operational requirements:**
  - Identify the actual tool referenced by the Xiaohongshu post.
  - Compare ≥3 alternatives (tmux, zellij, WezTerm mux, etc.).
  - Produce: research note, tool comparison table, one landable workflow.
  - State applicability and limits.
- **Supporting agents:** `@reviewer`.

## Execution order (per `cron/git-auto.md`)

Lowest number first, one issue per run:

1. #61 → branch `auto/issue-61`
2. #74 → branch `auto/issue-74`
3. #75 → branch `auto/issue-75`
4. #76 → branch `auto/issue-76`
5. #77 → branch `auto/issue-77`

Each run MUST:
- Fetch `origin/main` and branch fresh (`git checkout -B auto/issue-<n> origin/main`).
- Mark the issue `in_progress` in the local `.automation/issues.json` before work.
- Never stage `.automation/` paths.
- Stage only explicit paths — no `git add -A` / `git add .`.
- Produce exactly one PR per issue; no bundling.

## Out-of-scope issue

- **#67** — duplicate page title bug. Requires layout/template investigation,
  not research/writing. Tracked separately; not delegated to `@writer`.
