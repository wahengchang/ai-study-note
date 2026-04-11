---
title: "Dispatch — Research & Writing Queue (2026-04-11)"
description: "Operational assignment sheet that routes the current open research/writing issues to the correct agents under claude/agents/."
---

## Purpose

Audit the open issue queue on `wahengchang/ai-study-note`, isolate the research and
writing backlog, and route each item to the agent whose skill set matches the
operational requirements. This document is the single entry point for executing
the backlog — each row is a self-contained briefing that can be handed to the
named agent.

## Scope

Source: `mcp__github__list_issues` (state = OPEN) on `wahengchang/ai-study-note`, run on 2026-04-11.

### In scope — research and writing

| # | Title | Labels | Primary agent |
|---|---|---|---|
| [#77](https://github.com/wahengchang/ai-study-note/issues/77) | Research terminal multiplexing workflow that boosts Claude Code productivity and clarify cmux-related tooling | documentation, enhancement | `@writer` |
| [#76](https://github.com/wahengchang/ai-study-note/issues/76) | Research AI-powered YouTube automation workflow from n8n video and organize related tools | documentation, enhancement | `@writer` |
| [#75](https://github.com/wahengchang/ai-study-note/issues/75) | Research learn note on LLM-based knowledge management with raw and wiki workflow | documentation, enhancement | `@writer` (extend, do not duplicate) |
| [#74](https://github.com/wahengchang/ai-study-note/issues/74) | Write study note on Astron Agent, Serper, Jina AI, Python node, and LLM | documentation, enhancement | `@writer` |
| [#61](https://github.com/wahengchang/ai-study-note/issues/61) | (Research) 研究小紅書：寶藏開源項目，自動優化專業級提示詞 | — | `@writer` |

### Out of scope — deferred, not research/writing

| # | Title | Reason for deferral |
|---|---|---|
| [#67](https://github.com/wahengchang/ai-study-note/issues/67) | Fix duplicate article titles on ai-study-note pages | Layout / template bug. Route to an engineering pass on `quartz.layout.ts` + `@content-ops` audit. Not a writing task. |
| [#63](https://github.com/wahengchang/ai-study-note/issues/63) | Adopt Mintlify as new framework for ai-study-note docs site | Framework migration plan, not a note. Route to a separate architecture spike; no writer involvement at this stage. |

## Agent skill map

| Agent | Source | Best for |
|---|---|---|
| `@writer` | `claude/agents/writer.md` | Evidence-based note authoring, research synthesis, comparison tables, runbooks. Primary driver for every in-scope issue. |
| `@diagram` | `claude/agents/diagram.md` | Mermaid `flowchart LR` assets for workflow notes. Invoked after the writer drafts the body, only when visualization adds clarity. |
| `@reviewer` | `claude/agents/reviewer.md` | Final QA pass — structure, accuracy, style, completeness. Gate before merge on every in-scope issue. |
| `@content-ops` | `claude/agents/content-ops.md` | Placement decisions against `docs/content-taxonomy.md`, frontmatter normalization, wikilink updates, `index.md` regeneration. Invoked when folder placement is ambiguous or when a note touches an existing folder's index. |

## Assignments

### #77 — Terminal multiplexing + Claude Code productivity

**Primary agent**: `@writer`
**Supporting**: `@diagram` (multi-pane layout sketch), `@content-ops` (placement), `@reviewer` (QA)

**Operational requirements**

1. Source verification — `xhslink.com/o/AAbGLpO7BY4` is likely stale; confirm whether the post actually refers to `cmux` (search GitHub for repos named `cmux`), and document the canonical project name in the note's Context section. Flag the identification as a `> [!warning]` if uncertainty remains.
2. Comparative research — minimum 3 tools: `cmux`, `tmux`, `zellij`. Add `WezTerm mux` or `screen` if space allows.
3. Produce a comparison table (columns: installation, pane/session model, persistence, Claude Code integration notes, learning curve).
4. Derive at least one concrete Claude Code workflow (agent pane / logs pane / edit+git pane / long-task pane). Spell out keybinding examples.
5. Diagram: LR flowchart of the 4-pane workflow — delegate to `@diagram` once the body is drafted.

**Deliverables**

- One Quartz note under `content/claude-code/tools-and-skills/` (filename pending `@content-ops` classification; suggested `cmux-terminal-multiplexing-for-claude-code.md`).
- Comparison table + minimal workflow recipe + LR diagram.

**Acceptance (mirrors issue)**

- Canonical tool identity confirmed or clearly flagged.
- ≥3 tools compared.
- ≥1 actionable Claude Code workflow.
- Limits and applicable contexts stated.

---

### #76 — n8n YouTube automation workflow tool inventory

**Primary agent**: `@writer`
**Supporting**: `@diagram` (end-to-end workflow), `@content-ops` (placement — folder decision needed), `@reviewer` (QA)

**Operational requirements**

1. Decompose the workflow into the seven stages in the issue body (ideation → script → visual → audio → assembly → publish → log/notify).
2. Build a tool-category inventory table (Orchestration, LLM, Visual, Audio, Render, Publish, Storage/Notify). For each tool: one-line positioning, free tier presence, failure mode / licensing risk.
3. Distinguish "truly no-code" from "still needs integration glue" — this is the key reader insight. Flag explicitly per stage.
4. Add a Traditional Chinese content viability section (dubbing quality, TTS language coverage, subtitle handling).
5. Propose one minimal-viable PoC architecture — prefer the leanest chain that produces one publishable video end-to-end.
6. Diagram: LR flowchart of the seven-stage pipeline with tool labels — delegate to `@diagram`.
7. Risk section must cover: content quality, copyright, duplicate content policy, YouTube platform policy, cost envelope.

**Deliverables**

- One research note (placement TBD — candidates: `content/ai-workflows/`, `content/automation/`, or `content/claude-code/tools-and-skills/` if Claude Code-adjacent — route to `@content-ops`).
- Tool inventory table, PoC architecture sketch, risk register.

**Acceptance (mirrors issue)**

- Full workflow + tool categorization.
- Per-category purpose / advantage / limitation.
- ≥1 landable PoC.
- Risk items explicitly labeled.

---

### #75 — LLM-based knowledge management (raw / wiki workflow)

**Primary agent**: `@writer` — **extend mode, do not duplicate**
**Supporting**: `@content-ops` (merge vs new-file decision), `@reviewer` (QA)

**Operational requirements — IMPORTANT**

An existing note already covers Karpathy's LLM-maintained wiki pattern: `content/prompt-notes/karpathy-llm-wiki-pattern.md` (committed in `bc7dd17`, closes #65). The writer agent MUST read that note in full before writing and choose one of:

1. **Extend the existing note** with a new section covering the user's simplified personal variant (raw layer frozen, wiki layer LLM-maintained, IDE + Obsidian + Markdown + Git stack), plus 林穎俊's angle. Cross-link both references.
2. **Create a sibling note** only if the personal variant is substantively different enough that merging would harm the parent note's focus. If taking this path, the new note must wikilink to `karpathy-llm-wiki-pattern.md` in its Context section and avoid re-deriving the three-layer architecture.

Route the extend-vs-new decision through `@content-ops` before drafting.

**Additional operational requirements**

- Emphasize the raw-never-edited / wiki-always-evolving separation as the core design invariant.
- Capture the "queries produce new insights that feed back into the wiki" loop — this is the compounding mechanism that RAG lacks.
- Low-barrier implementation stack (IDE + Obsidian + Markdown + Git) is the angle that distinguishes this from the parent note.
- Diagram (optional, only if extending): a second LR flow showing the query-feedback loop.

**Deliverables**

- Either an updated `karpathy-llm-wiki-pattern.md` (preferred) or a new sibling note under `content/prompt-notes/`.
- Clear outline or draft level output — the issue accepts outline-quality.

**Acceptance (mirrors issue)**

- Explicit topic and outline.
- Raw / wiki separation value stated.
- Compounding knowledge base mechanism explained.
- Frame extendable into a public note.

---

### #74 — Astron Agent / Serper / Jina AI / Python node / LLM

**Primary agent**: `@writer`
**Supporting**: `@content-ops` (placement), `@reviewer` (QA)

**Operational requirements**

1. This is the closest to a pure writing task in the queue — the user has already supplied a positioning snippet in Telegram. Writer agent should start from that material rather than re-researching from zero.
2. Validate official links and pricing statements against current vendor pages (Serper.dev, jina.ai, iflytek Astron). Flag any stale claim.
3. Build a positioning table: component name | role type (AI model / tool / platform / code node) | free tier | common paid mode | official link.
4. Write a plain-language recap section ("這是 workflow 的不同零件，不是同一種 AI 工具") that a non-technical reader can follow — the user explicitly requested this register.
5. Keep in-depth implementation tutorials and full alternative comparisons out of scope; note them as "延伸方向" at the end.

**Deliverables**

- One publishable note draft. Placement TBD (likely `content/ai-workflows/` or a tooling folder) — route through `@content-ops`.
- Positioning table + plain-language summary.

**Acceptance (mirrors issue)**

- Explicit article title.
- Publishable outline or draft.
- Tool positioning and pricing statements are non-contradictory.
- Framing clearly separates workflow parts from "one AI tool".

---

### #61 — 小紅書 OSS prompt-optimizer project

**Primary agent**: `@writer`
**Supporting**: `@reviewer` (QA). No diagram, no content-ops — short research brief.

**Operational requirements**

1. Source identification — the `xhslink.com/o/7iAalKtM6SX` link is likely unreadable without a logged-in Xiaohongshu session. Pivot to name-based search: candidate projects include `prompt-optimizer`, `PromptWizard` (Microsoft), `DSPy` (Stanford), `promptulate`, `APE`. List the candidates you evaluated and the evidence used to pick one — record this in the note's Context so readers can re-verify.
2. TL;DR of 3–5 lines.
3. Core features list.
4. Reusable takeaways — minimum 3.
5. Explicit recommendation: is this worth collecting into `ai-study-note`? What follow-up notes would it unlock?
6. If the project cannot be identified with reasonable confidence, ship the research brief as a "candidates considered" document and close with a question back to the user rather than guessing.

**Deliverables**

- One research brief under `content/prompt-notes/` (kebab-case filename that reflects the chosen project). The issue already has a comment thread — check `mcp__github__issue_read` before starting to avoid duplicating prior research.

**Acceptance (mirrors issue)**

- Source project confirmed (or clearly flagged as unconfirmed with candidates listed).
- Readable research summary.
- ≥3 reusable takeaways.
- Explicit fit-for-collection verdict.

## Execution order

1. **#74** first — the writing material is already in hand, the scope is contained, and shipping it clears a pure-writing task quickly.
2. **#61** — short research brief; quick turnaround once source identification is resolved.
3. **#75** — extend existing note; requires `@content-ops` merge decision before drafting.
4. **#77** — moderate research, tool comparison, diagram dependency.
5. **#76** — largest surface area (seven pipeline stages, ~20 tools); schedule last.

`@reviewer` runs once per note, post-draft, pre-commit. `@diagram` runs inline within #77, #76, and optionally #75 after the body is drafted.

## Handover protocol

- Each agent invocation must cite this dispatch file and the issue number it is executing.
- Draft output lands as a PR on a branch named `research/<issue-number>-<slug>`.
- The PR description must include the "Acceptance" checklist from the relevant section of this dispatch.
- On merge, the closing commit must include `closes #<issue-number>` to auto-close the source issue, matching the repository's established convention (see `bc7dd17`, `ab90617`, `58b950e`).

## Change log

- 2026-04-11 — initial dispatch covering #77, #76, #75, #74, #61. #67 and #63 deferred out of research/writing scope.
