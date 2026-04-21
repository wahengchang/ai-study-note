---
phase: 260422-0vl-align-claude-agents-and-prompts-with-new
plan: 01
subsystem: docs
tags: [claude-prompts, content-taxonomy, governance, system-rules]

# Dependency graph
requires:
  - phase: pre-existing
    provides: docs/content-taxonomy.md (single-source-of-truth vocabulary for categories and tags)
provides:
  - .claude/config.yaml pointing at real on-disk paths (`.claude/agents/`, `.claude/prompts/`)
  - Source-of-truth pointer block in writer.md, reviewer.md, formatting.md (content-ops.md already had it)
  - Three-dimension tag model (Type / Subject / Tech) surfaced in the writer frontmatter sample and quality checklist
  - Reviewer BLOCK-severity enforcement for missing Type / missing Subject / banned tags (new `### 4.1 Tag Vocabulary Enforcement`)
  - docs/system-rules.md §3 and §4 trimmed to defer to content-taxonomy.md (no vocabulary duplicated, no banned tags listed)
affects: [@writer, @reviewer, @content-ops, future-content-audits, future-tag-drift-checks]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "content-taxonomy.md as single source of truth; agent/doc files defer via pointer blocks"
    - "Three-dimension tag vocabulary (Dimension A Type, B Subject, C Tech)"
    - "BLOCK-severity gate on missing Type/Subject or banned tags in reviewer audits"

key-files:
  created: []
  modified:
    - .claude/config.yaml
    - .claude/agents/content-ops.md
    - .claude/agents/writer.md
    - .claude/agents/reviewer.md
    - .claude/prompts/formatting.md
    - docs/system-rules.md

key-decisions:
  - "Taxonomy-first architecture: all agent prompts and system-rules defer to docs/content-taxonomy.md rather than duplicating vocabulary, eliminating the drift hazard that seeded banned tags into system-rules §3."
  - "Missing Type or missing Subject tag is BLOCK severity in @reviewer — equal weight to a broken build or missing required frontmatter field."
  - "config.yaml comment on line 2 (not strictly in scope of the plan's '~10 occurrence' estimate) also updated from `claude/prompts/` to `.claude/prompts/` for internal consistency."

patterns-established:
  - "Source-of-truth pointer block at the top of every agent/prompt file: > **Source of truth**: [`docs/content-taxonomy.md`](../../docs/content-taxonomy.md) — read first for categories and tag vocabulary."
  - "Relative path from .claude/agents/ and .claude/prompts/ to docs/ is ../../docs/ — standardized across writer, reviewer, content-ops."

requirements-completed: [ALIGN-01, ALIGN-02, ALIGN-03, ALIGN-04, ALIGN-05, ALIGN-06]

# Metrics
duration: 5min
completed: 2026-04-22
---

# Phase 260422-0vl Plan 01: Align .claude/ Agents and Prompts with content-taxonomy Summary

**Made docs/content-taxonomy.md the single source of truth for categories and tags across every agent prompt and system-rules doc, fixed broken registry paths in .claude/config.yaml, and added BLOCK-severity enforcement for missing Type/Subject tags in @reviewer.**

## Performance

- **Duration:** 5 min (348s)
- **Started:** 2026-04-21T16:41:26Z
- **Completed:** 2026-04-21T16:47:14Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Fixed the `.claude/config.yaml` agent registry — every `path:` and `prompts:` entry now points at a real on-disk file (previously all 10 entries pointed at the non-existent `claude/` directory).
- Eliminated the tag-vocabulary drift hazard in `docs/system-rules.md`: removed the Platform/Topic/Type three-table framing that listed 9 banned tags (`tutorial`, `context-window`, `memory`, `workspace`, `routing`, `hr`, `sales`, `tts`, `google-workspace`, `plugin`). §3 and §4 now defer to the taxonomy.
- Added source-of-truth pointer blocks to `@writer`, `@reviewer`, and `formatting.md` (matching the existing pointer style in `@content-ops`).
- Established BLOCK severity for missing Type/Subject tags in `@reviewer` via a new `### 4.1 Tag Vocabulary Enforcement` subsection.
- Surfaced the three-dimension tag model (Type / Subject / Tech) in the `@writer` frontmatter sample and Quality Checklist — first time the Tech dimension appears explicitly in an agent prompt.

## Task Commits

The plan's explicit commit gate consolidated all three tasks into a single atomic commit (Task 3):

1. **Task 1:** Fix .claude/config.yaml path prefixes and content-ops.md safety-rule reference — staged for commit by Task 3
2. **Task 2:** Add taxonomy pointers to writer/reviewer/formatting and trim system-rules §3/§4 — staged for commit by Task 3
3. **Task 3:** Stage the six modified files and commit — `5256b6d` (chore)

The plan intentionally uses a single commit rather than per-task commits because the six edits form one cohesive alignment change — splitting them would leave the registry pointing at `.claude/` paths while system-rules still listed banned tags, or vice versa. The commit gate in Task 3 preserves atomicity.

## Files Modified

- `.claude/config.yaml` — Added `.` prefix to all 4 `path:` values and 6 `prompts:` list entries (10 lines changed). Also updated the file-header comment on line 2 (`claude/prompts/` → `.claude/prompts/`).
- `.claude/agents/content-ops.md` — Single-line change at line 173: grep safety rule now references `.claude/` instead of `claude/`. (File already had the source-of-truth pointer block at line 4 — this plan used its style as the template for writer.md and reviewer.md.)
- `.claude/agents/writer.md` — Three edits: (1) added pointer block after the `> Compose:` line; (2) replaced 4-line frontmatter sample (`category:` and `tags:` subtree) with taxonomy-referenced version including Dimension A/B/C comments; (3) appended two new checklist items to Quality Checklist.
- `.claude/agents/reviewer.md` — Three edits: (1) added pointer block after `> Compose:` line; (2) appended 5-bullet Tag vocabulary group under `### 3. Style Compliance`; (3) inserted new `### 4.1 Tag Vocabulary Enforcement` subsection between `### 4. Completeness` and `## Output Format` declaring BLOCK severity for missing Type/Subject/banned tags.
- `.claude/prompts/formatting.md` — Single-line insertion: Taxonomy pointer blockquote under the subtitle, declaring style-only scope for this file.
- `docs/system-rules.md` — Two body replacements: (1) §3 body (60 lines) replaced with 13-line deferral pointer + 4 tagging rules; (2) §4 body (17 lines) replaced with 11-line deferral pointer + 3 rules. Section headings `## 3. Tag Taxonomy (Controlled Vocabulary)` and `## 4. Categories (Flat Layout)` preserved verbatim. Net: −67 lines in system-rules.md (before: 252 lines; after: ~196 lines).

## Decisions Made

- **Taxonomy-first architecture** — rather than sync two copies of the vocabulary (one in `docs/content-taxonomy.md`, one in `docs/system-rules.md`), system-rules §3 and §4 now explicitly defer. Agents reading system-rules no longer encounter contradictory banned tags.
- **BLOCK severity for Type/Subject enforcement** — a note missing a Type tag is now treated with the same severity as a broken build or a missing required frontmatter field, not a WARN.
- **Scope of config.yaml comment edit** — line 2 (`# All agents compose reusable prompt fragments from claude/prompts/.`) was updated to `.claude/prompts/` for internal consistency. Task 1 said "replace every occurrence" which included this line, and leaving it bare would have been immediately confusing to the next reader.

## Deviations from Plan

None — plan executed exactly as written.

All six edits matched the plan's surgical prescriptions byte-for-byte. No scope creep, no auto-fixes needed. The config.yaml line-2 comment update (noted above under Decisions) was explicitly covered by the plan's "replace every occurrence" directive — not a deviation.

## Issues Encountered

None. The plan was surgical and complete: exact `old_string`/`new_string` text was provided in the plan body, paths and section boundaries matched real file content, and no ambiguity was encountered.

One minor observation (not a problem): the working tree at start had unrelated modifications (`src/components/PostList.astro`, `src/pages/index.astro`, `src/pages/blog/index.astro`, `src/pages/categories/[category].astro`, `src/pages/tags/[tag].astro`) and untracked files (`.claude/` itself was untracked, plus `.planning/` subdirs and various `public/assets/` images). Per the plan's explicit "Do NOT use `git add .` or `git add -A`" constraint, only the six target files were staged — all other pending changes remain in the working tree for a future session.

## Verification

All 5 phase-level checks from the plan's `<verification>` block pass:

1. **Config registry resolves on disk** — all 9 `.claude/...` references in config.yaml map to existing files.
2. **No banned tags leak** — `docs/system-rules.md` and every file under `.claude/agents/` and `.claude/prompts/` is free of `context-window`, `google-workspace`, `tts`, `hr`, `sales`, `workspace`, `routing`, `plugin`, `tutorial`.
3. **Taxonomy pointers present** — `writer.md`, `reviewer.md`, `content-ops.md`, `formatting.md` all reference `docs/content-taxonomy.md`.
4. **System-rules defers, doesn't duplicate** — system-rules.md references content-taxonomy.md; the old "Approved categories" table row for `prompt-notes` is gone.
5. **Reviewer enforces BLOCK severity** — `Tag Vocabulary Enforcement` section contains `BLOCK`.

No `npm run build` run (explicit constraint: prompt/doc changes only, no content-schema validation needed). No `git add .` or `git add -A` used — stage by explicit path only.

## Next Phase Readiness

- `@writer`, `@reviewer`, and `@content-ops` now produce coherent, taxonomy-aligned output. The next content audit (`@content-ops` Mode 2) will no longer find false-positive violations seeded by banned tags in system-rules.
- The `.claude/config.yaml` registry now works — future tooling that reads the registry to locate agent/prompt files will resolve correctly.
- `docs/content-taxonomy.md` is unchanged by this plan and remains the single source of truth; any future vocabulary changes now have exactly one file to edit.

---
*Phase: 260422-0vl-align-claude-agents-and-prompts-with-new (quick task)*
*Completed: 2026-04-22*

## Self-Check: PASSED

**Files claimed created/modified — verified on disk:**
- FOUND: .claude/config.yaml
- FOUND: .claude/agents/content-ops.md
- FOUND: .claude/agents/writer.md
- FOUND: .claude/agents/reviewer.md
- FOUND: .claude/prompts/formatting.md
- FOUND: docs/system-rules.md
- FOUND: .planning/quick/260422-0vl-align-claude-agents-and-prompts-with-new/260422-0vl-SUMMARY.md (this file)

**Commit claimed:**
- FOUND: 5256b6d (`chore(prompts): align .claude/ agents and system-rules with content-taxonomy`)
