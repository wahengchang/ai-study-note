---
phase: 02-content-migration
plan: 01
subsystem: content-migration
tags: [astro, astro-content, gray-matter, obsidian-migration, zod-schema, content-collections]

# Dependency graph
requires:
  - phase: 01-scaffold-and-content-schema
    provides: "Zod blog schema at src/content.config.ts with { title, description, pubDate, category, tags, draft } — required fields have no .default(); category/tags normalized via .toLowerCase().trim()"
provides:
  - "72 schema-valid notes under src/content/blog/*.md (flat layout with category-prefix collision naming)"
  - "15 binary assets copied to public/assets/** preserving subdirectory structure (openclaw/ subfolder intact)"
  - "scripts/migrate-content.mjs: idempotent ESM migration script with code-span-aware wikilink transform, depth-first collision resolution, and git-history pubDate derivation"
  - "gray-matter added as devDependency for deterministic YAML frontmatter serialization"
  - "Legacy content/ directory fully removed from the tree"
  - "Phase 1 seed src/content/blog/_scaffold-check.md deleted"
affects: [03-layouts-and-routes, 04-deploy]

# Tech tracking
tech-stack:
  added:
    - "gray-matter ^4.0.3 (devDependency only — one-time migration tool; not a runtime dep)"
  patterns:
    - "Code-span-aware text transforms: split body into prose vs fenced-code segments, protect inline ``...`` spans with \\u0000 placeholders before regex-replacing wikilinks. Prevents JSON-array literals like '[[\"x\",\"y\",\"z\"]]' from being mis-parsed as Obsidian wikilinks."
    - "Depth-first file ordering for collision resolution: shallower paths claim the canonical '<category>-index.md' name before deeper nested index files, which cleanly fall to '<category>-<parentDir>-<basename>.md' via the second-collision rule."
    - "Git-log pubDate derivation: 'git log --diff-filter=A --format=%aI -- <file> | tail -1' for original-commit date, fallback to today when the file has no commit history yet. Captures authentic 'when this note was first written' for sort/display."

key-files:
  created:
    - "scripts/migrate-content.mjs"
    - "src/content/blog/*.md (72 files)"
    - "public/assets/**/* (15 files)"
  modified:
    - "package.json (+gray-matter devDependency)"
    - "package-lock.json"
  deleted:
    - "src/content/blog/_scaffold-check.md"
    - "content/ (entire legacy tree)"

key-decisions:
  - "Truthful file count is 72, not the plan's 84 — the 84 in the plan came from `find content -name \"*.md\" | wc -l` which includes 12 macOS `._*` resource-fork siblings. Real unique notes = 72; script scans/migrates/validates 72."
  - "Flat destination with category-prefix collision naming (per 02-CONTEXT.md 'Claude's Discretion'): 14 basename collisions resolved deterministically — 9 index.md files, 3 skill.md files, plus 2 category-parent-prefix variants."
  - "Code-fence + inline-code protection added to the wikilink transform after Task 2 surfaced a data-corruption bug: `[[\"x\",\"y\",\"z\"]]` inside a shell example was being rewritten to `\"x\",\"y\",\"z\"`. Fix committed as part of Task 2 and re-run cleanly."
  - "Image paths in migrated bodies use literal absolute URL `/ai-study-note/assets/<name>` (Astro's base is applied at emit time; public/* serves at ${base}/* on GitHub Pages). Not `import.meta.env.BASE_URL` — Markdown bodies can't template-literal."
  - "One pre-existing YouTube Markdown-image link (`![](https://www.youtube.com/watch?v=...)` in learn-claude-code-guide.md) was preserved as-is per scope boundary — pre-existing author syntax, not a migration artifact."

patterns-established:
  - "Pattern: Migration scripts live in scripts/ as .mjs ESM, committed for audit trail, idempotent via gray-matter.stringify (deterministic YAML). Can be re-run safely against a clean source tree."
  - "Pattern: Wikilink transforms must be code-aware. Any text substitution on Markdown bodies must skip content inside fenced code blocks AND inline code spans to avoid corrupting JSON/array/shell examples that visually collide with wikilink syntax."
  - "Pattern: Asset migration uses fs.cpSync with a filter callback that rejects macOS `._*` resource forks and .DS_Store. Destination recount confirms filter did its job."
  - "Pattern: Collision names resolved in three tiers — primary basename → `<topCategory>-<basename>` → `<topCategory>-<parentDir>-<basename>` → numeric suffix (never reached on current content). All collisions logged to stdout at migration end."

requirements-completed:
  - MIGR-01
  - MIGR-02
  - MIGR-03
  - MIGR-04
  - MIGR-05

# Metrics
duration: 8min
completed: 2026-04-21
---

# Phase 02 Plan 01: Content Migration Summary

**72 legacy Obsidian notes migrated to Astro Content Collections via an idempotent Node ESM script — frontmatter normalized to the Zod schema, Obsidian wikilinks and Smart Columns scrubbed (code-span safe), 15 assets relocated to public/assets/, legacy content/ tree deleted, build green end-to-end.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-20T17:13:59Z
- **Completed:** 2026-04-20T17:22:11Z
- **Tasks:** 3
- **Files modified:** 91 created + 1 modified + 1 deleted (+ entire legacy `content/` tree removed)

## Accomplishments

- `scripts/migrate-content.mjs` (408 lines) — idempotent ESM migration tool with gray-matter, walks `content/` recursively, derives missing frontmatter, transforms Obsidian syntax in prose only, handles basename collisions deterministically, copies assets, emits a structured summary
- **72 schema-valid notes** in `src/content/blog/*.md` — every one passes the Phase 1 Zod gate (`astro build` exit 0 in ~1.0s across the full set)
- **14 basename collisions** resolved cleanly: `claude-code-index.md`, `openclaw-index.md`, `prompt-notes-index.md`, `seo-and-geo-index.md`, `setup-env-index.md`, plus 5 category-parent-prefix variants (`claude-code-tools-and-skills-index.md`, `openclaw-common-questions-index.md`, `openclaw-instruction-notes-index.md`, `openclaw-skill-notes-index.md`, `prompt-notes-gemini-prompts-index.md`) and 4 `skill.md` variants (`openclaw-skill.md`, `openclaw-minimax-tts-skill.md`, `openclaw-minimax-skill.md`, `openclaw-n8n-workflow-skill-skill.md`)
- **Obsidian syntax scrubbed:** 11 image wikilinks → `![](/ai-study-note/assets/<name>)`, 108 labeled wikilinks `[[target|Label]]` → `Label`, 24 Smart Column fence lines removed, 0 bare wikilinks encountered in real content
- **15 asset files copied** to `public/assets/` (8 top-level + 7 under `openclaw/` subfolder); macOS `._*` and `.DS_Store` filtered during copy
- **9 notes fell back to today's date** — git `--diff-filter=A` returned empty for uncommitted recent additions (expected on a live working tree); all other pubDates came from the first-commit author date
- `_scaffold-check.md` seed deleted; entire `content/` legacy tree deleted; build re-verified green after deletion

## Migration Script Output (full transcript)

```
Migration complete:
  Files scanned:       72
  Files migrated:      72
  Basename collisions: 14
    - index.md → claude-code-index.md (category-prefix)
    - index.md → openclaw-index.md (category-prefix)
    - index.md → prompt-notes-index.md (category-prefix)
    - index.md → seo-and-geo-index.md (category-prefix)
    - index.md → setup-env-index.md (category-prefix)
    - index.md → claude-code-tools-and-skills-index.md (category-parent-prefix)
    - index.md → openclaw-common-questions-index.md (category-parent-prefix)
    - index.md → openclaw-instruction-notes-index.md (category-parent-prefix)
    - index.md → openclaw-skill-notes-index.md (category-parent-prefix)
    - index.md → prompt-notes-gemini-prompts-index.md (category-parent-prefix)
    - skill.md → openclaw-skill.md (category-prefix)
    - skill.md → openclaw-minimax-tts-skill.md (category-parent-prefix)
    - skill.md → openclaw-minimax-skill.md (category-parent-prefix)
    - skill.md → openclaw-n8n-workflow-skill-skill.md (category-parent-prefix)
  Wikilinks stripped:  119
    image:   11
    labeled: 108
    bare:    0
  Smart Column fences: 24
  Assets copied:       15
  Fallback-today dates: 9
  Errors:              0
```

## Task Commits

1. **Task 1: Write migration script + install gray-matter** — `3e94df5` (chore: add content migration script)
2. **Task 1b (deviation): Fix code-span handling + depth-first sort** — `94afd19` (fix: protect code spans from wikilink transform, sort shallower-first)
3. **Task 2: Run migration + delete seed + build gate** — `4e048ab` (feat: migrate 72 notes to src/content/blog with normalized frontmatter)
4. **Task 3: Remove legacy content/ directory** — `14e2d98` (chore: remove legacy content/ directory)

**Plan metadata commit:** pending (final commit will bundle SUMMARY.md + STATE.md + ROADMAP.md + REQUIREMENTS.md).

## Files Created/Modified

### Created
- `scripts/migrate-content.mjs` — 408 lines, idempotent Node ESM, uses gray-matter, includes `segmentByCode` and `withInlineCodeProtected` helpers
- `src/content/blog/*.md` — 72 migrated notes (flat layout)
- `public/assets/*.png` — 8 top-level images
- `public/assets/openclaw/*.png` — 7 nested images

### Modified
- `package.json` — added `"gray-matter": "^4.0.3"` to devDependencies
- `package-lock.json` — npm-generated

### Deleted
- `src/content/blog/_scaffold-check.md` — Phase 1 seed (02-CONTEXT.md requirement)
- `content/` — entire legacy Obsidian vault tree (72 .md + 12 macOS `._*` siblings + `.obsidian/` vault metadata + `assets/`)

## Build Gate Evidence (MIGR-04)

```
> astro build

01:19:20 [content] Syncing content
01:19:20 [content] Synced content
01:19:20 [types] Generated 407ms
01:19:20 [build] ✓ Completed in 731ms.
01:19:20 [build] 1 page(s) built in 1.18s
01:19:20 [build] Complete!
```

Zero schema validation errors. All 72 migrated notes pass the Zod gate from Phase 1.

## Decisions Made

See `key-decisions` in frontmatter. Headline: **real file count is 72, not 84** (plan's 84 counted macOS resource-fork siblings); **code-span protection required** to prevent data corruption in shell/JSON examples; **flat layout with deterministic collision prefixing** per 02-CONTEXT.md "Claude's Discretion".

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Wikilink regex corrupted JSON array literals inside code spans**
- **Found during:** Task 2 (post-migration verification grep)
- **Issue:** The bare-wikilink regex `/\[\[([^\]]+?)\]\]/g` matched inside an inline code span containing `'[["x","y","z"]]'` (a shell command example in `openclaw/skill-notes/gog/skill.md`) and rewrote it to `'"x","y","z"'`. Data corruption in a code example.
- **Fix:** Added `segmentByCode()` to split body into prose vs fenced-code segments, and `withInlineCodeProtected()` to swap inline code spans for `\u0000CODE_SPAN_N\u0000` placeholders before running wikilink regexes. Smart-Column fence detection is also now code-fence-aware so `:::col` inside a fenced block would be preserved.
- **Files modified:** `scripts/migrate-content.mjs`
- **Verification:** Re-ran migration against a cleaned destination; output of `grep -rE '\[\[' src/content/blog/` shows only 3 legitimate occurrences, all inside inline code spans (`\`[[ $- == *i* ]]\`` shell test, and two `[[...]]` JSON array literals) — none are actual Obsidian wikilinks. Wikilinks-stripped count dropped from 121 to 119 (the 2 false-positive bare matches are no longer transformed).
- **Committed in:** `94afd19`

**2. [Rule 3 - Blocker] Collision resolution ordering produced ugly numeric-suffix names**
- **Found during:** Task 2 (first migration run)
- **Issue:** First run produced `openclaw-index-2.md`, `prompt-notes-index-2.md`, `index-index.md` — numeric suffixes because the collision order put depth-3 `<cat>/<subcat>/index.md` ahead of depth-2 `<cat>/index.md` in alphabetical sort, so the wrong file won the primary category-prefix slot.
- **Fix:** Sort source files by path depth first, then alphabetically within a depth. Root `content/index.md` (depth 1) claims `index.md` before any `<cat>/index.md`; `<cat>/index.md` (depth 2) claims `<cat>-index.md` before `<cat>/<subcat>/index.md` (depth 3), which then cleanly falls to `<cat>-<subcat>-index.md` via the parent-prefix rule.
- **Files modified:** `scripts/migrate-content.mjs` (`collectSourceFiles` sort comparator)
- **Verification:** Re-ran migration; collision log now shows 14 clean names, zero numeric-suffix fallbacks. All index files have human-readable destination names.
- **Committed in:** `94afd19` (same commit as bug #1)

**3. [Rule 3 - Blocker] Pre-existing macOS resource-fork files in src/content/blog/**
- **Found during:** Task 1 (Task 1 verify gate — `find src/content/blog -name "*.md" | wc -l` returned 2, not 1)
- **Issue:** `src/content/blog/.__scaffold-check.md` was created by the macOS filesystem as a sibling to `_scaffold-check.md` when extended attributes got written. Its presence broke the Task 1 "destination untouched" assertion.
- **Fix:** Deleted the resource fork. The project's `.gitignore` already excludes `._*` so it was never going to be tracked; this was purely a filesystem hygiene fix.
- **Files modified:** n/a (untracked file removed)
- **Verification:** `find src/content/blog -name "*.md" | wc -l` now returns 1 (the seed), and after migration returns 72.
- **Committed in:** not applicable (untracked file deletion)

**4. [Rule 2 - Missing Critical] Filter macOS `._*` resource forks during asset cpSync**
- **Found during:** Task 1 script authoring (anticipatory — 15 `._*` files in content/assets would have been copied into public/assets verbatim)
- **Issue:** The plan's action step said to use `fs.cpSync(... { recursive: true, force: true })` but didn't mention filtering. Given macOS host and a gitignore that excludes `._*`, a naïve copy would leak resource forks into `public/`.
- **Fix:** Added a `filter` callback to `cpSync` that rejects paths whose basename starts with `._` or equals `.DS_Store`. Also wrote a post-copy walker that recounts files excluding `._*` for accurate stats reporting.
- **Files modified:** `scripts/migrate-content.mjs` (cpSync call)
- **Verification:** `find src/content/blog public/assets -name "._*"` returns nothing post-migration; asset count is 15 (8 top-level + 7 nested).
- **Committed in:** `3e94df5` (baked into Task 1's initial script)

---

**Total deviations:** 4 auto-fixed (1 bug, 2 blocking, 1 missing critical). Two of them (#1 and #2) required a separate `fix(02-01)` commit (`94afd19`) because they surfaced after the Task 1 "script written" commit had already landed.

**Impact on plan:** All four deviations were necessary for correctness. #1 prevented data loss in a real content file. #2 made the output inspectable and aesthetically sensible. #3 cleared a pre-existing filesystem artifact that the verify gate tripped on. #4 is a defensive filter the plan should have mentioned but didn't. No scope creep.

## Issues Encountered

- **Plan claim of "84 notes" vs. reality of 72 notes:** The plan's pre-flight `find content -name "*.md" -not -path "*/.obsidian/*" | wc -l` counted macOS `._*` resource-fork siblings (invisible in Finder, visible to `find`). The 12 `._*` files plus 72 real notes = 84. I migrated the 72 real notes and flagged the discrepancy in the content commit message. The verify script in the plan (`test "$COUNT" = "84"`) would have failed — I did not run that literal check; instead I verified the truthful count (72 = scanned = migrated = zero errors) and ran the authoritative `npm run build` gate, which is the ground truth.
- **Cosmetic `error: non-monotonic index .git/objects/pack/._pack-*.idx` warnings** appear on every git operation. Pre-existing from Phase 1 (noted in Plan 01-03 SUMMARY); doesn't affect commit integrity. Leaving for Phase 5 cleanup per established precedent.
- **One pre-existing YouTube external link as Markdown image** (`![](https://www.youtube.com/...)` in `learn-claude-code-guide.md`) is preserved verbatim from source. The plan's IMAGE_PATHS_OK verify would flag it, but it's not a migration artifact — it's an author-authored external embed. Left alone per scope-boundary rule.
- **`.gitignore` already excludes `._*`** so resource forks generated by macOS during the migration never entered git — but `find` still sees them on the filesystem, so I ran `find ... -delete` twice during intermediate verification to keep counts honest.

## User Setup Required

None — migration is entirely local code + filesystem.

## Next Phase Readiness

- **Phase 3 (layouts & routes)** now has 72 real notes to iterate against instead of the one-note seed. All notes have `category` and `tags` populated (normalized at schema load via `.toLowerCase().trim()`), so `getStaticPaths` for category/tag routes will work against real data.
- **Draft filter reminder:** every `getCollection("blog", ...)` call in Phase 3 must carry `({ data }) => !data.draft` per PROJECT.md constraint. None of the migrated notes are drafts (all have `draft: false`), but the discipline still applies.
- **Base URL reminder:** internal Astro links in Phase 3 components must use `import.meta.env.BASE_URL` (not hardcoded `/blog/...`). Migrated Markdown bodies already use the literal `/ai-study-note/assets/...` prefix for images — that pattern is body-level and distinct from component-level link discipline.
- **Asset access verified at build time:** `dist/assets/<name>` exists after `npm run build`. Production URL shape will be `https://wahengchang.github.io/ai-study-note/assets/<name>`.
- **Script retained in-tree** at `scripts/migrate-content.mjs` per 02-CONTEXT.md recommendation (audit trail for the transformation; won't be re-executed but serves as reviewable documentation of the exact rules applied).

---
*Phase: 02-content-migration*
*Plan: 01*
*Completed: 2026-04-21*

## Self-Check: PASSED

Files verified on disk:
- `scripts/migrate-content.mjs`
- `src/content.config.ts` (Phase 1 contract, unchanged)
- `.planning/phases/02-content-migration/02-01-SUMMARY.md` (this file)
- `src/content/blog/*.md` — 72 files (0 `._*`)
- `public/assets/**/*` — 15 files (0 `._*`)

Commits verified in git history (`git log --all | grep <hash>`):
- `3e94df5` Task 1 (chore: add migration script + gray-matter dep)
- `94afd19` Bug fix (fix: code-span protection + depth-first sort)
- `4e048ab` Task 2 (feat: migrate 72 notes + copy assets + delete seed)
- `14e2d98` Task 3 (chore: remove legacy content/ directory)

MIGR gates verified:
- MIGR-01: 72 migrated .md files in src/content/blog
- MIGR-02/04: `npm run build` exits 0, zero schema validation errors
- MIGR-03: no Smart Column fences remain; no Obsidian wikilink transforms remain outside code spans (3 occurrences of `[[` are all inside inline code spans — legitimate shell/JSON syntax)
- MIGR-05: `content/` directory does not exist
