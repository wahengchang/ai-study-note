# Research & Writing Dispatch — 2026-04-14 (nBuf4)

Kickoff manifest for [`cron/git-auto.md`](./git-auto.md). Audits the current
open issue queue, filters to research/writing deliverables, analyses each one's
operational requirements, and delegates to the correct agent per
[`claude/config.yaml`](../claude/config.yaml).

This PR does **not** execute any individual issue. The `git-auto` loop picks
one issue per run (lowest-numbered eligible) under its existing invariants.

## 1. Audit result (7 open issues)

| # | Title (short) | Category | Open PR | Disposition |
|---|---------------|----------|---------|-------------|
| #61 | 小紅書 auto prompt-optimizer OSS research | research | #73 | **skip** — in flight |
| #63 | Adopt Mintlify as docs framework | infra / migration | #124 | **exclude** — not research/writing |
| #67 | Fix duplicate H1 titles on article pages | layout bug | #68 | **exclude** — `@content-ops` territory |
| #74 | Astron Agent / Serper / Jina / Python / LLM workflow note | writing | #121 | **skip** — in flight |
| #75 | Raw/Wiki LLM knowledge management learn note | research + writing | #120 | **skip** — in flight |
| **#76** | **n8n AI YouTube automation workflow research** | **research** | **—** | **READY (next pick)** |
| **#77** | **cmux / terminal multiplexing × Claude Code** | **research** | **—** | **READY (follow-up)** |

**Filtered in-scope set:** #61, #74, #75, #76, #77.
**Out-of-scope:** #63 (site architecture RFC), #67 (layout/template bug).

## 2. Per-issue operational requirements

### #61 — XHS prompt-optimizer OSS research · SKIP (PR #73)

- **Deliverable:** research summary note + adoption verdict.
- **Inputs:** Xiaohongshu post link; may need follow-up to identify the exact
  OSS project.
- **Risk:** source ambiguity — verify repo/owner before publishing claims.

### #74 — Astron / Serper / Jina / Python / LLM study note · SKIP (PR #121)

- **Deliverable:** lean Quartz note explaining each component's role, pricing,
  and position in a shared AI workflow.
- **Inputs:** user Telegram message already pasted in the issue.
- **Risk:** mixing up tool categories — enforce one-line role per component.

### #75 — Raw/Wiki LLM knowledge management learn note · SKIP (PR #120)

- **Deliverable:** learn note explaining raw/wiki two-layer separation,
  feedback loop, and low-threshold implementation path.
- **Inputs:** user's Chinese write-up; Karpathy / 林穎俊 references.
- **Risk:** overlap with merged note `#65` (Karpathy LLM-maintained wiki) —
  cross-link instead of duplicating.

### #76 — n8n AI YouTube automation workflow research · READY

- **Deliverable:** research note + tool taxonomy + minimum-viable PoC sketch.
- **Inputs:** YouTube URL `https://www.youtube.com/watch?v=5Htbfh_LYSE`.
- **Ops steps:**
  1. Parse the video into workflow stages: ideation → script → visuals →
     voice → assembly → publish → logging.
  2. Inventory tools per stage (n8n, Sheets, GPT/Gemini, Fal.ai, Kling, Veo3,
     ElevenLabs, Suno, json2video, Creatomate, FFmpeg, YouTube API, Blotato,
     Discord/Telegram webhooks).
  3. Flag real no-code vs. engineered integration boundaries.
  4. Capture cost structure, policy risks (YouTube ToS, copyright,
     duplicate-content policy), suitability for zh-TW content.
  5. Propose the smallest PoC that proves the pipeline end-to-end.
- **Risk:** scope creep — one note, one tool matrix, one PoC sketch.

### #77 — cmux / terminal multiplexing × Claude Code · READY (after #76)

- **Deliverable:** research note + multiplexer comparison table + Claude Code
  pane layout.
- **Inputs:** Xiaohongshu link `http://xhslink.com/o/AAbGLpO7BY4`.
- **Ops steps:**
  1. Identify the actual tool the post references; confirm whether it is the
     upstream `cmux` or a namesake.
  2. Compare against `tmux`, `zellij`, `WezTerm mux`, Warp workspace.
  3. Distil a four-pane layout for Claude Code: agent / logs /
     edit-git-test / long-running monitor.
  4. Record constraints: persistence, scripting, resource cost, OS support.
- **Risk:** tool-identity ambiguity — confirm first, write second.

## 3. Agent delegation

Per [`claude/config.yaml`](../claude/config.yaml):

| Issue | Primary | Support | Rationale |
|-------|---------|---------|-----------|
| #61 | `@writer` | `@reviewer` | Prose research summary + adoption verdict. |
| #74 | `@writer` | `@reviewer` | Component study note; no diagram needed beyond prose table. |
| #75 | `@writer` | `@reviewer` | Learn note; cross-link to #65 instead of re-drawing. |
| **#76** | **`@writer`** | **`@diagram` (LR flowchart), `@reviewer`** | End-to-end pipeline benefits from a single `flowchart LR` stage map. |
| #77 | `@writer` | `@reviewer` | Comparison matrix; diagram only if pane layout genuinely earns its keep. |

`@content-ops` is **not** eagerly invoked — `@writer` proposes placement
(`content/ai-workflow/` for #76, `content/claude-code/` for #77) and escalates
only if ambiguous.

## 4. Execution handoff to `cron/git-auto.md`

Per `cron/git-auto.md` §4 (lowest-number first, skip open-PR issues):

1. **Next run:** `git fetch origin && git checkout -B auto/issue-76 origin/main`
   → draft the n8n YouTube automation research note with `@writer` +
   `@diagram` → open one PR closing #76.
2. **Run after:** `auto/issue-77` off fresh `origin/main` → `@writer` (after
   confirming tool identity) → one PR closing #77.
3. **Stop after one issue per run.** Do not bundle.

## 5. Invariants honoured by this PR

- `.automation/` not staged (directory does not exist in the repo).
- Explicit-path staging only — single file `cron/dispatch-2026-04-14-nBuf4.md`.
- Branched fresh from `origin/main` (`bc7dd17`); working tree was clean.
- No `content/` or Quartz config edits bundled — manifest only.
- One branch, one PR — queued issues will each get their own later.
