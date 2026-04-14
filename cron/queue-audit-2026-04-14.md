# Issue Queue Audit — Research & Writing Delegation

**Run date**: 2026-04-14
**Scope**: filter open issues in `wahengchang/ai-study-note` for **research** and **writing** tasks, analyze operational requirements, and delegate each to the appropriate agent defined in `claude/config.yaml`.
**Next step**: initiate the execution workflow documented in [`cron/git-auto.md`](./git-auto.md) — one issue per branch, one branch per PR, lowest issue number first.

## 1. Filter result

Open issues reviewed: **7**. Filtered for research/writing intent: **5**.

| # | Title | Classification | Has `auto/issue-<n>` branch | Eligible this run |
|---|---|---|---|---|
| 77 | Research terminal multiplexing (cmux) + Claude Code workflow | Research → Note | No | Yes |
| 76 | Research AI-powered YouTube automation (n8n) | Research → Note | No | Yes |
| 75 | Research LLM-based knowledge management (raw / wiki) | Research → Note | No | **Yes — lowest #, pick first** |
| 74 | Write study note on Astron Agent / Serper / Jina AI / Python node / LLM | Writing → Note | **Yes** (`auto/issue-74`) | No (skip — tracked) |
| 61 | Research 小紅書 open-source prompt optimization project | Research → Note | **Yes** (`auto/issue-61`) | No (skip — tracked) |

Excluded from this filter (non-research/writing):

- **#67** duplicate article titles — frontend/layout bug, routes to `@content-ops` in a separate queue.
- **#63** adopt Mintlify framework — platform/architecture evaluation, not a note. Routes to a future planning agent.

## 2. Operational requirements per filtered issue

### #75 — LLM knowledge management (raw / wiki)

- **Output type**: learn note / study note outline + draft.
- **Sources**: user-supplied Chinese brief; Karpathy + 林穎俊 references; personal implementation on Obsidian + Git + Markdown.
- **Key asks**: articulate the raw ↔ wiki two-layer split; describe AI-driven structuring, summarisation, cross-linking, and feedback loop.
- **Risk**: source material is prose/opinion, not code — classify as **Architect**-intent note (design decisions, trade-offs), not Debug.
- **Placement candidate**: `content/llm-workflow/` or `content/agents-ai/` — defer to `@content-ops` taxonomy decision tree before publishing.
- **Agent**: `@writer` (primary). Escalate placement ambiguity to `@content-ops`. No diagram required unless layer model benefits from a small `flowchart LR`.

### #76 — n8n YouTube automation workflow

- **Output type**: research note + tool matrix + PoC sketch.
- **Sources**: Japanese YouTube walkthrough + named tool list (n8n, Fal.ai, Kling, Veo3, Suno, json2video, etc.).
- **Key asks**: decompose end-to-end workflow; map each stage to tools + alternatives; flag cost, copyright, platform-policy risks.
- **Risk**: **tool availability volatile** — annotate every tool with "verified-as-of 2026-04" timestamp and link to official docs. Mark unverified claims with `> [!warning]`.
- **Agent**: `@writer` (primary) + `@diagram` (secondary — pipeline fits `flowchart LR` with 5–6 stages).

### #77 — cmux / terminal multiplexing for Claude Code

- **Output type**: research note + tool comparison table + minimum-viable workflow.
- **Sources**: 小紅書 post (partial); tool landscape (tmux / zellij / screen / WezTerm / Warp mux).
- **Key asks**: confirm identity of `cmux` referenced in the post before writing; compare ≥3 alternatives; propose one concrete pane layout for Claude Code long-running tasks.
- **Risk**: source is truncated → first task is identity confirmation; if unresolved, mark `clarification_needed` per `cron/git-auto.md` §4.
- **Agent**: `@writer`. No diagram required.

### #74 — Astron Agent / Serper / Jina AI / Python node / LLM (tracked)

- **Output type**: publishable study note explaining each component's role, pricing, official links, and workflow position.
- **State**: `auto/issue-74` branch exists on origin → presumed PR open → **skip this run** per invariant "if issue already has an open PR, skip it".
- **Agent on record**: `@writer`, to be reviewed by `@reviewer` before merge.

### #61 — open-source prompt optimisation project (tracked)

- **Output type**: short research summary (≥3 reusable takeaways) + fitness assessment for ai-study-note inclusion.
- **State**: `auto/issue-61` branch exists on origin → **skip this run**.
- **Agent on record**: `@writer` for the summary; `@content-ops` if the project warrants a dedicated folder.

## 3. Delegation matrix

| Issue | Primary agent | Secondary agent | Prompts composed |
|---|---|---|---|
| 75 | `@writer` | `@content-ops` (placement) | `formatting.md`, `quartz.md` |
| 76 | `@writer` | `@diagram` (pipeline) | `formatting.md`, `mermaid.md`, `quartz.md` |
| 77 | `@writer` | — | `formatting.md`, `quartz.md` |
| 74 | `@writer` | `@reviewer` | `formatting.md`, `quartz.md` |
| 61 | `@writer` | `@content-ops` | `formatting.md`, `quartz.md` |

Agent selection rationale:

- **`@writer`** — every filtered issue produces a note; writer is the default role per `claude/config.yaml`.
- **`@diagram`** — only invoked where a visualization demonstrably adds clarity (#76 has a multi-stage pipeline).
- **`@reviewer`** — enforced as a gate for writing-heavy issues with existing branches (#74) before merge.
- **`@content-ops`** — consulted for taxonomy / folder placement when the writer cannot match the note to an existing folder in `docs/content-taxonomy.md`.

## 4. Execution handoff to `cron/git-auto.md`

Per the cron invariants:

1. Preflight — `git fetch origin` clean, working tree clean.
2. Tracked PRs first — #74 and #61 branches already exist; a separate run must rebase / refresh them against `origin/main` if behind.
3. Pick **one** open issue this run: lowest-numbered filtered issue without a branch → **#75**.
4. Next run would pick #76, the run after #77 (unless priorities change).

This audit is the **kickoff artifact**; it does not itself modify `content/`. Actual note authoring happens on the per-issue `auto/issue-<n>` branch created by the next `cron/git-auto.md` run.
