# Research & Writing Queue — Execution Brief

> Kickoff brief for the `cron/git-auto.md` automation workflow.
> Generated: 2026-04-12 · Source: open issues on `wahengchang/ai-study-note`.
> Scope: research and writing tasks only. Bug fixes (e.g. #67) and framework migrations without a writing deliverable are excluded.

## How to use this brief

- `git-auto.md` picks **one open issue per run, lowest number first, skipping issues that already have an open PR**.
- Each entry below records the operational requirements, the deliverable shape, and the agent that owns execution.
- Agent references follow `claude/config.yaml`:
  - `@writer` — Principal-engineer-style note authoring under `content/`.
  - `@diagram` — Mermaid diagrams (LR orientation only).
  - `@reviewer` — Style, accuracy, and completeness audit before PR.
  - `@content-ops` — File layout, frontmatter, bulk rename.

## Execution order

| Priority | Issue | Type | Primary agent | Supporting agents |
|---|---|---|---|---|
| 1 | #61 | Research | `@writer` | `@reviewer` |
| 2 | #74 | Writing | `@writer` | `@reviewer` |
| 3 | #75 | Research + Writing | `@writer` | `@diagram`, `@reviewer` |
| 4 | #76 | Research + Writing | `@writer` | `@diagram`, `@reviewer` |
| 5 | #77 | Research + Writing | `@writer` | `@diagram`, `@reviewer` |

Order follows `git-auto.md`: lowest issue number first, single issue per branch, single PR per branch.

---

## #61 — 研究小紅書「自動優化專業級提示詞」開源項目

- **Classification**: Research (prompt engineering tooling).
- **Primary agent**: `@writer`.
- **Supporting agents**: `@reviewer` (fact-check project identity).
- **Operational requirements**:
  - Resolve the Xiaohongshu link `http://xhslink.com/o/7iAalKtM6SX` to the exact open-source project referenced.
  - Confirm project name, repo URL, license, and maintenance status.
  - Extract core features, usage modes, and target scenarios for automated prompt optimization.
- **Deliverable shape** (`content/research/` or `content/prompt-notes/`):
  - TL;DR (3–5 lines) with repo and official links.
  - Core features list with evidence (README quotes, command examples).
  - ≥3 reusable takeaways for downstream notes.
  - Explicit recommendation on whether to promote this to a full `ai-study-note` entry.
- **Definition of done** (from the issue):
  - Source project identified.
  - Readable research summary published.
  - ≥3 reusable bullet points.
  - Inclusion verdict recorded.
- **Risks / notes**: Xiaohongshu links can be rate-limited or region-locked. If the link cannot be resolved, `@writer` must record the failure mode and propose a fallback (keyword search against likely candidates).

## #74 — Write study note on Astron Agent, Serper, Jina AI, Python node, LLM

- **Classification**: Writing (workflow component explainer).
- **Primary agent**: `@writer`.
- **Supporting agents**: `@reviewer` (terminology precision, pricing accuracy).
- **Operational requirements**:
  - Recover the source Telegram material from the issue reporter before drafting.
  - Classify each component as model / tool / platform / code node.
  - Record free-tier vs paid posture with official links.
  - Frame all five as *workflow parts*, not competing AI tools.
- **Deliverable shape** (`content/ai-workflow/` or similar):
  - Title + frontmatter `title`.
  - One-line positioning statement per component.
  - Pricing / free-tier row per component with source link.
  - Closing section that reframes the five items as an assembled workflow.
  - Optional: a plain-language rewrite targeted at non-technical readers.
- **Definition of done** (from the issue):
  - Clear title.
  - Publishable outline or draft.
  - No conflation between positioning and pricing.
  - Explicitly distinguishes workflow parts from competing products.
- **Risks / notes**: Pricing pages drift. `@writer` must datestamp every pricing claim and link to the source page.

## #75 — Learn note on LLM-based knowledge management (raw / wiki workflow)

- **Classification**: Research + writing (methodology note).
- **Primary agent**: `@writer`.
- **Supporting agents**: `@diagram` (raw→wiki flow, query-writeback loop), `@reviewer` (attribution to Karpathy / 林穎俊).
- **Operational requirements**:
  - Restate the raw/wiki separation: raw is append-only, wiki is the curated and evolving layer.
  - Describe how the LLM turns raw material into structured wiki notes with summaries, categories, and cross-links.
  - Capture the query → retrieval → writeback loop that lets the knowledge base self-reinforce.
  - Reference the Karpathy and 林穎俊 source material and the IDE + Obsidian + Markdown + Git toolchain.
- **Deliverable shape** (`content/knowledge-management/` or `content/workflow/`):
  - Outline or draft with a clear thesis on why raw/wiki separation matters.
  - Diagram (LR) of the raw → curation → wiki → query → writeback loop.
  - Bulleted section on why this suits personal knowledge management.
  - Explicit non-goals (no production architecture, no exhaustive tool comparison).
- **Definition of done** (from the issue):
  - Clear topic and outline.
  - Raw/wiki separation value articulated.
  - Query/writeback loop described.
  - Extensible framework for a public note.
- **Risks / notes**: Attribution risk — `@reviewer` must verify the Karpathy and 林穎俊 references before publication.

## #76 — n8n-based AI YouTube automation workflow

- **Classification**: Research + writing (toolchain teardown).
- **Primary agent**: `@writer`.
- **Supporting agents**: `@diagram` (end-to-end pipeline graph), `@reviewer` (cost / policy claims).
- **Operational requirements**:
  - Deconstruct the referenced video (https://www.youtube.com/watch?v=5Htbfh_LYSE) into pipeline stages: topic → script → visuals → audio → assembly → publish → telemetry.
  - Bucket tools by role (orchestration, LLM, visual, audio, rendering, publishing, storage/telemetry).
  - Evaluate which steps are genuinely no-code vs require engineering glue.
  - Assess fit for Traditional Chinese content and for research-oriented rather than short-form farming.
- **Deliverable shape** (`content/workflow/` or `content/automation/`):
  - Workflow walkthrough keyed to pipeline stages.
  - Tool classification table with purpose / strengths / limits / cost posture.
  - Minimum-viable PoC architecture sketch (LR Mermaid).
  - Risk callouts: quality, copyright, duplicate content, YouTube policy.
- **Definition of done** (from the issue):
  - Full workflow and tool classification documented.
  - Each tool bucket covers purpose, strengths, and limits.
  - ≥1 actionable PoC proposal.
  - Explicit risk notes on quality, copyright, duplication, and platform policy.
- **Risks / notes**: Many referenced tools (Veo3, Nano Banana 2, Kling 3.0) ship pricing and access changes frequently. Datestamp every claim.

## #77 — Terminal multiplexing workflow for Claude Code (`cmux`)

- **Classification**: Research + writing (tooling comparison).
- **Primary agent**: `@writer`.
- **Supporting agents**: `@diagram` (pane / session layout), `@reviewer` (terminology precision between `cmux`, `tmux`, `zellij`, WezTerm mux).
- **Operational requirements**:
  - Resolve the source Xiaohongshu post (`http://xhslink.com/o/AAbGLpO7BY4`) and identify the exact `cmux`-like tool the author refers to.
  - Clarify whether the referenced tool is a terminal multiplexer, session orchestrator, or pane/tab workflow layer.
  - Compare it against `tmux`, `zellij`, `screen`, and WezTerm workspace/mux.
  - Document Claude Code best practices for multi-pane, multi-session, and long-running task monitoring.
- **Deliverable shape** (`content/workflow/` or `content/tooling/`):
  - Research note focused on how terminal multiplexing accelerates Claude Code workflows.
  - Tool comparison table covering ≥3 candidates.
  - Minimum-viable workflow recipe: agent pane, log pane, edit/git/test pane, long-running monitor pane.
  - Explicit fit and limits section.
- **Definition of done** (from the issue):
  - Source tool identity confirmed.
  - ≥3 tools compared.
  - ≥1 Claude Code workflow recipe delivered.
  - Fit and limits documented.
- **Risks / notes**: `cmux` is ambiguous — there are several projects under that name. If `@writer` cannot confirm the source, the note must explicitly disambiguate and cover the most plausible candidates.

---

## Out-of-scope issues

| Issue | Reason |
|---|---|
| #63 | Framework migration evaluation (Mintlify). Primarily an architecture / planning task with no `content/` deliverable. Track separately. |
| #67 | Site bug fix — duplicate titles. Belongs to `@content-ops` + layout changes, not the research/writing queue. |

## Handoff checklist for `git-auto.md`

- [ ] Preflight passes (`git fetch origin`, working tree clean).
- [ ] For each run, pick the lowest-numbered open issue from the table above that does not already have an open PR.
- [ ] Branch `auto/issue-<n>` from fresh `origin/main`.
- [ ] Delegate implementation to the primary agent listed above; invoke supporting agents before PR open.
- [ ] Stage files by explicit path (never `git add .`, never touch `.automation/`).
- [ ] Validate with `npm run check` and `npm run quartz -- build` before pushing.
- [ ] Open exactly one PR per issue and record status in `.automation/issues.json`.
