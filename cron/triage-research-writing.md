# Triage: Research & Writing Queue

> Companion to [`git-auto.md`](./git-auto.md). This document records the current audit of the open issue queue, filters it down to research and writing work, analyzes each issue's operational requirements, and delegates it to the appropriate agent in `claude/agents/`.
>
> `git-auto.md` consumes this queue **one issue per run, one branch per PR** (per its invariants). This file is the static plan; actual branches, commits, and PRs are produced by the automation loop.

## Audit Summary

| Metric | Value |
|---|---|
| Open issues scanned | 7 |
| Research / writing tasks | 5 |
| Out-of-scope (deferred) | 2 |
| Source | `mcp__github__list_issues` at audit time |

## Filter Rules

An issue enters the queue if **either** condition holds:

1. **Writing** — the deliverable is a Markdown note under `content/` (study / learn / research note).
2. **Research** — the deliverable is a written summary of third-party material (video, post, repo) that informs a future note.

Bug fixes, layout changes, plugin/theme work, and framework migrations are out of scope for this triage — they belong to engineering-focused agents, not `@writer` / `@reviewer` / `@diagram`.

## In-Scope Queue (process in `git-auto.md` lowest-number-first order)

| Order | Issue | Title | Primary Agent | Support Agents | Deliverable Type |
|---|---|---|---|---|---|
| 1 | [wahengchang/ai-study-note#61](https://github.com/wahengchang/ai-study-note/issues/61) | 研究小紅書：自動優化專業級提示詞 | `@writer` | `@reviewer` | Research note |
| 2 | [wahengchang/ai-study-note#74](https://github.com/wahengchang/ai-study-note/issues/74) | Astron Agent / Serper / Jina AI / Python node / LLM study note | `@writer` | `@reviewer` | Study note |
| 3 | [wahengchang/ai-study-note#75](https://github.com/wahengchang/ai-study-note/issues/75) | LLM-based knowledge management with raw / wiki workflow | `@writer` | `@diagram`, `@reviewer` | Learn note |
| 4 | [wahengchang/ai-study-note#76](https://github.com/wahengchang/ai-study-note/issues/76) | AI-powered YouTube automation workflow (n8n) | `@writer` | `@diagram`, `@reviewer` | Research note |
| 5 | [wahengchang/ai-study-note#77](https://github.com/wahengchang/ai-study-note/issues/77) | Terminal multiplexing workflow for Claude Code (cmux) | `@writer` | `@reviewer` | Research note |

`git-auto.md` § "Pick one open issue" picks lowest number first, so the queue is naturally ordered by issue number.

## Per-Issue Operational Requirements

### 1. Issue #61 — 自動優化專業級提示詞 (research)

- **Primary agent:** `@writer` (Research objective variant; short TL;DR + 3–5 reusable takeaways).
- **Support:** `@reviewer` for accuracy + style pass.
- **Inputs:** xiaohongshu post `http://xhslink.com/o/7iAalKtM6SX`; the open-source prompt-optimizer project it references.
- **Pre-work required:** Identify the exact repo/project referenced before drafting. If ambiguous, the agent must stop and add a `clarification_needed` comment rather than guess.
- **Target path:** `content/prompt-notes/<kebab-case>.md` (tentative; `@content-ops` confirms taxonomy at intake).
- **Definition of done:** source repo confirmed, TL;DR ≤ 5 lines, ≥ 3 reusable points, explicit "worth archiving?" verdict.
- **Diagram:** not needed.

### 2. Issue #74 — Astron Agent / Serper / Jina AI / Python node / LLM (writing)

- **Primary agent:** `@writer` (Architect objective — each tool is a role in a larger AI workflow).
- **Support:** `@reviewer` for terminology consistency; pricing statements must be evidence-linked.
- **Inputs:** user-supplied Telegram summary; each tool's official docs for pricing confirmation.
- **Pre-work required:** verify pricing tiers against official pages at authoring time (values change). Flag any unverified claim with `> [!warning]`.
- **Target path:** `content/ai-workflow/<kebab-case>.md`.
- **Definition of done:** each component has one-line positioning, correct category (model / tool / platform / code node), official link, free-tier note; closing section frames the 5 components as workflow parts, not competing products.
- **Diagram:** optional — a small flowchart LR showing how the five roles compose is nice-to-have but only if it adds clarity.

### 3. Issue #75 — raw / wiki knowledge-management workflow (learn note)

- **Primary agent:** `@writer` (Architect objective — design of a personal KM system).
- **Support:** `@diagram` for the raw → wiki → query feedback loop; `@reviewer` for style pass.
- **Inputs:** user-provided Chinese narrative; Karpathy / 林穎俊 reference material for context framing only (avoid re-stating their work).
- **Scope guardrails:** do **not** drift into full product implementation or tool comparison matrix — the issue explicitly excludes both.
- **Target path:** `content/knowledge-management/<kebab-case>.md`.
- **Definition of done:** raw vs wiki role separation explained, feedback loop described, low-barrier IDE + Obsidian + Markdown + Git stack justified, one diagram illustrating the loop.
- **Diagram:** **required**. `@diagram` produces a `flowchart LR` with 4–6 nodes: `raw` → `AI structuring` → `wiki` → `query` → writeback to `wiki`.

### 4. Issue #76 — n8n AI YouTube automation (research)

- **Primary agent:** `@writer` (Architect objective — workflow decomposition + tool inventory).
- **Support:** `@diagram` for the end-to-end pipeline; `@reviewer` for coverage of the acceptance checklist.
- **Inputs:** the referenced YouTube video (`5Htbfh_LYSE`); official docs for each listed tool (Fal.ai, Kling, Veo3, Eleven Labs, Suno, json2video, Creatomate, Blotato, etc.).
- **Pre-work required:** **rights & policy risks must be called out explicitly** — YouTube automation content often brushes against platform policy on repetitive/AI-generated uploads. The acceptance criteria require this.
- **Target path:** `content/ai-workflow/<kebab-case>.md` (likely `n8n-youtube-automation-<slug>.md`).
- **Definition of done:** 7-stage workflow decomposed, each tool grouped + linked + costed + risk-noted, ≥ 1 PoC architecture proposed, risks section covers: quality, copyright, duplicate content, YouTube policy.
- **Diagram:** **required**. `flowchart LR` — ideation → script → visual → audio → render → publish → log/notify.

### 5. Issue #77 — Terminal multiplexing for Claude Code (research)

- **Primary agent:** `@writer` (Optimize objective — productivity workflow).
- **Support:** `@reviewer` for accuracy of tool comparisons.
- **Inputs:** xiaohongshu post `http://xhslink.com/o/AAbGLpO7BY4`; `cmux` / `tmux` / `zellij` / WezTerm mux documentation.
- **Pre-work required:** **verify the exact `cmux`** the post refers to — the name is ambiguous (multiple projects use it). If the author's intended project cannot be confirmed, add `clarification_needed` instead of guessing.
- **Target path:** `content/workflow/<kebab-case>.md`.
- **Definition of done:** post's tool identity confirmed, ≥ 3 comparable tools in a comparison table, ≥ 1 minimum-viable Claude Code pane layout recommended, applicability + limits stated.
- **Diagram:** optional — a compact pane-layout illustration may help but is not required.

## Out-of-Scope (Not Delegated Here)

| Issue | Why Deferred |
|---|---|
| [wahengchang/ai-study-note#67](https://github.com/wahengchang/ai-study-note/issues/67) | Layout / theme bug — Quartz component or frontmatter-handling fix, not a writing task. Route to a site-engineering agent, not `@writer`. |
| [wahengchang/ai-study-note#63](https://github.com/wahengchang/ai-study-note/issues/63) | Framework migration evaluation (adopt Mintlify). Infrastructure decision, not a note. Belongs in a separate RFC / ADR flow. |

Both remain **OPEN** in GitHub; they are intentionally not consumed by `git-auto.md`'s writing queue.

## Execution Workflow

This triage is the input; `cron/git-auto.md` is the executor. The loop is:

```
flowchart LR
    Queue[triage-research-writing.md] --> Pick[git-auto.md: pick lowest open issue]
    Pick --> Agent[Delegate to @writer + support]
    Agent --> Draft[Draft note on auto/issue-&lt;n&gt; branch]
    Draft --> Review[@reviewer BLOCK/WARN/INFO]
    Review --> Build[npm run quartz -- build]
    Build --> PR[Open one PR, mark pr_open]
```

Per `git-auto.md` invariants: one issue per run, branch fresh from `origin/main`, `.automation/` is never staged, staged paths are always explicit.

## Change Log

- **2026-04-14** — initial triage covering 5 in-scope research/writing issues (#61, #74, #75, #76, #77); 2 deferred (#63, #67).
