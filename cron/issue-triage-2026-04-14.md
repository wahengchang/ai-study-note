# Issue Queue Triage — Research & Writing Delegation

> Runtime: 2026-04-14 · Scope: `cron/git-auto.md` workflow initiation
> Repo: `wahengchang/ai-study-note` · Base: `origin/main`

## Filter Criteria

Filtered **open** issues for tasks whose primary deliverable is a research note or a writing artifact under `content/`. Bug fixes and layout tickets are excluded from this batch.

| # | Title | Category | Labels |
|---|-------|----------|--------|
| 61 | 研究小紅書：寶藏開源項目，自動優化專業級提示詞 | Research | — |
| 74 | Study note on Astron Agent, Serper, Jina AI, Python node, LLM | Writing | documentation, enhancement |
| 75 | Learn note on LLM-based knowledge management (raw/wiki) | Research + Writing | documentation, enhancement |
| 76 | Research n8n AI-powered YouTube automation workflow | Research + Writing | documentation, enhancement |
| 77 | Research terminal multiplexing (cmux) + Claude Code productivity | Research + Writing | documentation, enhancement |

Excluded: **#67** (duplicate-title layout fix — belongs to `content-ops` / template layer, not the research/writing lane).

## Operational Requirements & Agent Delegation

### Issue #61 — Prompt optimizer open-source project research
- **Deliverable**: Research summary note under `content/research-notes/` with project identity, TL;DR, core features, 3+ reusable takeaways, recommendation.
- **Inputs**: 小紅書 URL (`http://xhslink.com/o/7iAalKtM6SX`).
- **Ops**: External link resolution → repo identification → TL;DR synthesis.
- **Complexity**: Low–Medium. Single source; self-contained research scope.
- **Agent**: `@writer` (research mode). No diagram required.
- **Risks**: Short-link may expire; fall back to keyword search for "prompt optimizer open source" if unresolvable.

### Issue #74 — Astron Agent / Serper / Jina AI / Python node / LLM
- **Deliverable**: Publishable study note under `content/ai-notes/` explaining each component's role, pricing tier, official links, and their division of labor in one workflow.
- **Inputs**: User-provided Telegram draft (already captured in issue body).
- **Ops**: Structure draft → verify official URLs and free-tier facts → render Quartz-compliant Markdown with frontmatter `title`.
- **Complexity**: Low. Source material is pre-gathered.
- **Agent**: `@writer` (primary) → `@reviewer` (accuracy + style audit before merge).
- **Risks**: Pricing details drift; cite "as of 2026-04" and link official pages.

### Issue #75 — LLM-based knowledge management (raw / wiki split)
- **Deliverable**: Learn-note outline or draft under `content/ai-notes/` covering raw/wiki separation, AI-driven wiki synthesis, query-time feedback loops, and low-barrier IDE + Obsidian + Git stack.
- **Inputs**: Karpathy reference, 林穎俊 reference, user narrative in issue body.
- **Ops**: Concept mapping → design rationale → example query loop.
- **Complexity**: Medium. Requires conceptual synthesis across multiple practitioners.
- **Agent**: `@writer` (primary) + `@diagram` (one LR flow: raw → AI synthesis → wiki → query → wiki write-back).
- **Risks**: Scope creep into tool comparisons — enforce the "not included" list from the issue.

### Issue #76 — n8n YouTube automation workflow
- **Deliverable**: Research note under `content/research-notes/` covering end-to-end workflow decomposition, tool taxonomy (orchestration / LLM / visual / audio / assembly / publishing / storage), PoC blueprint, and risk register (copyright, platform policy, cost).
- **Inputs**: YouTube URL (`https://www.youtube.com/watch?v=5Htbfh_LYSE`).
- **Ops**: Video transcription/summary → tool matrix compilation → PoC minimum-viable path.
- **Complexity**: High. Largest scope in the batch; many tools, cross-category dependencies.
- **Agent**: `@writer` (primary) + `@diagram` (LR pipeline: topic → script → visual → audio → assembly → publish → log). Gate with `@reviewer` before PR.
- **Risks**: Tool list outdates fast; mark each tool row with "as of 2026-04" and link status. Consider splitting into two notes if it exceeds ~600 lines.

### Issue #77 — Terminal multiplexing (cmux) + Claude Code productivity
- **Deliverable**: Research note under `content/research-notes/` identifying the actual tool referenced, explaining its role vs. tmux/zellij/WezTerm, and proposing one minimum Claude Code workflow.
- **Inputs**: 小紅書 URL (`http://xhslink.com/o/AAbGLpO7BY4`).
- **Ops**: Source resolution → tool comparison matrix → Claude Code multi-pane recipe.
- **Complexity**: Medium. Requires disambiguation of `cmux`.
- **Agent**: `@writer` (primary). Optional `@diagram` for a 4-pane layout sketch.
- **Risks**: If `cmux` resolves to multiple candidates, document both and mark the authoritative one.

## Delegation Summary

| # | Primary Agent | Secondary | Est. Scope | Rationale |
|---|---------------|-----------|------------|-----------|
| 61 | `@writer` | — | S | Self-contained summary |
| 74 | `@writer` | `@reviewer` | S | Material ready; needs QA |
| 75 | `@writer` | `@diagram` | M | Concept flow benefits from LR diagram |
| 76 | `@writer` | `@diagram`, `@reviewer` | L | Cross-category tool map + PoC |
| 77 | `@writer` | `@diagram` | M | Tool disambiguation + workflow recipe |

## Execution Order — per `cron/git-auto.md`

The workflow dictates **one issue per run, lowest number first, branched fresh from `origin/main`**.

1. **This run → Issue #61** (lowest number in the filtered set).
   - Branch: `auto/issue-61` (created from `origin/main` at execution time).
   - Agent: `@writer`.
   - Gate: `npm run check` + `npm run quartz -- build` must exit 0.
   - On success: PR titled `feat: research note — prompt optimizer 開源項目 (closes #61)`.
2. Subsequent runs (one per run): #74 → #75 → #77 → #76.
   - #76 is scheduled last because its scope is largest and the agent may need to negotiate a split before starting.

## Invariants Acknowledged

- `.automation/` is never staged or committed.
- Each issue branch is re-created from a fresh `origin/main` fetch, not reused.
- One issue per branch, one branch per PR — no bundling.
- `git diff --cached --stat` reviewed before every commit.

## Next Action

This PR registers the triage decisions and initiates the `cron/git-auto.md` loop. The automation's next tick should pick up **#61** as the single actionable issue for this run.
