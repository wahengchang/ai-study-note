---
phase: 01-scaffold-and-content-schema
plan: 03
subsystem: infra
tags: [astro, astro-content, zod, content-collections, glob-loader, schema-validation]

# Dependency graph
requires:
  - phase: 01-scaffold-and-content-schema
    provides: "Astro 6.1.8 scaffold with buildable shell + .astro/types.d.ts in tsconfig (Plan 02)"
provides:
  - "Type-safe `blog` Content Collection defined in src/content.config.ts at src/ ROOT (Astro 6 convention)"
  - "Zod schema: { title, description, pubDate, category, tags, draft } — required fields have NO .default(), category/tags normalized via .toLowerCase().trim()"
  - "glob() loader resolving **/*.md under ./src/content/blog (nested folders allowed, non-.md ignored)"
  - "Seed note src/content/blog/_scaffold-check.md proving the schema accepts a valid document end-to-end (Phase 2 deletes)"
  - "SCHE-03 smoking gun: reproducible scripted proof that astro build rejects missing required fields with InvalidContentEntryDataError"
affects: [02-content-migration, 03-layouts-and-routes, 04-deploy]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Astro 6 content schema placement: src/content.config.ts at src/ ROOT, not src/content/config.ts. The legacy path is no longer resolved."
    - "Required-field-no-default discipline: any field without `.default(...)` is load-bearing. Zod raises InvalidContentEntryDataError at build time when missing. Tags/draft are the only defaulted fields."
    - "Schema-level normalization: category and every tag run .toLowerCase().trim() at parse time, so downstream getCollection consumers never see mixed-case `AI` vs `ai` route collisions."

key-files:
  created:
    - "src/content.config.ts"
    - "src/content/blog/_scaffold-check.md"
  modified: []

key-decisions:
  - "Placed content.config.ts at src/ root — Astro 6 dropped resolution of src/content/config.ts"
  - "Seed note filename prefixed with underscore (_scaffold-check.md) — Astro convention for ignore-me files, also signals this is a throwaway proof"
  - "Deliberate mixed-case frontmatter values (category: Scaffold, tags: [Astro, Migration]) used in seed to exercise .toLowerCase().trim() normalization during Phase 2 verification"

patterns-established:
  - "Pattern: Zod content schemas call out required vs defaulted explicitly — required fields never carry .default(), audited via `awk '/^[[:space:]]*(title|description|pubDate|category):/' src/content.config.ts | grep -c '\\.default('` returning 0"
  - "Pattern: Schema-rejection proof — break a seed note in a tmp copy, run astro build, confirm NON-ZERO exit AND log contains at least one of {zod, invalid, required, title, description, schema}, then restore byte-identically"

requirements-completed: [SCHE-01, SCHE-02, SCHE-03]

# Metrics
duration: 2min
completed: 2026-04-21
---

# Phase 01 Plan 03: Content Collection Schema Summary

**Type-safe `blog` collection via glob() loader + Zod schema at src/content.config.ts, with a scripted SCHE-03 proof that astro build rejects missing required fields via InvalidContentEntryDataError.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-20T16:59:19Z
- **Completed:** 2026-04-20T17:01:01Z
- **Tasks:** 2
- **Files modified:** 2 (both created)

## Accomplishments
- `src/content.config.ts` landed verbatim per PROJECT.md spec — `defineCollection` + `glob` loader + Zod `z.object({...})` with 6 fields
- Required fields (`title`, `description`, `pubDate`, `category`) have zero `.default()` calls — static audit via `awk | grep -c` returns 0
- `category` + `tags` array elements carry `z.string().toLowerCase().trim()` (grep count = 2)
- `tags` defaults to `[]`; `draft` defaults to `false`
- `src/content/blog/_scaffold-check.md` seed note created with complete valid frontmatter (including deliberate mixed-case `Scaffold` / `Astro` / `Migration` values to exercise normalization)
- `npm run build` exits 0 in ~750ms — content sync generates types (`.astro/types.d.ts`) in 220–320ms, blog collection picked up without warnings
- SCHE-03 proven both ways: statically (grep confirms no required-field defaults) and dynamically (scripted malformed-seed build fails with `InvalidContentEntryDataError`, seed restored, build green again)

## Task Commits

1. **Task 1: Write src/content.config.ts with Zod schema and add valid seed note** — `e9379fb` (feat)
2. **Task 2: Prove the schema fails loudly on malformed frontmatter (SCHE-03 negative test)** — no code commit (verification-only task; the script restored the seed byte-identically, no net file change). Proof transcript captured in this SUMMARY below.

**Plan metadata commit:** pending (final commit will bundle SUMMARY.md + STATE.md + ROADMAP.md + REQUIREMENTS.md).

## Files Created/Modified
- `src/content.config.ts` — `defineCollection` + `glob({ pattern: "**/*.md", base: "./src/content/blog" })` + Zod schema `{ title, description, pubDate: z.coerce.date(), category: z.string().toLowerCase().trim(), tags: z.array(z.string().toLowerCase().trim()).default([]), draft: z.boolean().default(false) }`, exports `collections = { blog }`
- `src/content/blog/_scaffold-check.md` — seed note, `draft: true`, deliberately mixed-case frontmatter values to probe normalization (deleted by Phase 2)

## Decisions Made
- None beyond what the plan specified; schema shape came from PROJECT.md verbatim. Seed file content followed CONTEXT.md's `_scaffold-check.md` naming and `draft: true` instruction.

## SCHE-03 Dynamic Test — Full Transcript

This is the audit artifact proving `astro build` fails loudly on malformed frontmatter. The script below was executed verbatim from the repo root; final exit was PASS with seed restored byte-identically.

### Script

```bash
set -e
SEED="src/content/blog/_scaffold-check.md"
BACKUP="$(mktemp)"
LOG="$(mktemp)"
cp "$SEED" "$BACKUP"

# Write a deliberately malformed version — title removed, description removed
cat > "$SEED" <<MALFORMED
---
pubDate: 2026-04-21
category: "Scaffold"
---

Missing required title and description — schema MUST reject this.
MALFORMED

# Run build — capture output, expect FAILURE
if npm run build > "$LOG" 2>&1; then
  echo "FAIL: astro build succeeded on malformed frontmatter — schema has silent defaults"
  cp "$BACKUP" "$SEED"; rm -f "$BACKUP" "$LOG"; exit 1
fi

# Build failed — confirm the failure is a Zod schema error (not some unrelated crash)
if ! grep -qiE "(zod|invalid|required|title|description|schema)" "$LOG"; then
  echo "FAIL: build failed but not for schema reasons"
  cat "$LOG"
  cp "$BACKUP" "$SEED"; rm -f "$BACKUP" "$LOG"; exit 1
fi

echo "PASS: astro build rejected malformed frontmatter with a schema error"

# Restore original seed
cp "$BACKUP" "$SEED"
rm -f "$BACKUP" "$LOG"
```

### Captured Output (tail of build failure log)

```
> ai-study-note@5.0.0 build
> astro build

01:00:30 [content] Syncing content
[InvalidContentEntryDataError] blog → _scaffold-check data does not match collection schema.

  title**: **title: Required
  description**: **description: Required

  Hint:
    See https://docs.astro.build/en/guides/content-collections/ for more information on content schemas.
  Error reference:
    https://docs.astro.build/en/reference/errors/invalid-content-entry-data-error/
  Location:
    /Volumes/UGREEN 2TB /projects/ai-study-note/src/content/blog/_scaffold-check.md:0:0
  Stack trace:
    at getEntryData (file:///.../node_modules/astro/dist/content/utils.js:155:26)
    at async eval (...)

PASS: astro build rejected malformed frontmatter with a schema error
```

### Final Script Output

```
PASS: astro build rejected malformed frontmatter with a schema error
```

### Post-restore Verification

```
OK: title preserved (grep '^title: "Scaffold Check"$' → match)
OK: draft: true preserved (grep '^draft: true$' → match)
npm run build → exit 0, 1 page(s) built in 754ms
```

## Deviations from Plan

None — plan executed exactly as written. Schema text, seed note content, verification scripts, and acceptance criteria all came from the plan verbatim.

## Issues Encountered
- The stale `.git/objects/pack/._pack-*.idx` non-monotonic-index warning from Plan 02 is still present on every git operation. Fully cosmetic (all commits logged correctly). Out of scope for this plan; can be cleaned later with `find .git/objects -name '._*' -delete`.

## User Setup Required

None — schema definition is entirely local code.

## Next Phase Readiness
- Phase 2 (content migration) now has a concrete Zod contract to write against. The migration agent can import `collections` from `src/content.config.ts` or rely on Astro's auto-generated types via `astro:content` for `getCollection("blog")` return shape.
- Phase 2 MUST delete `src/content/blog/_scaffold-check.md` when real content lands — it's a throwaway seed (filename underscore-prefixed, `draft: true`).
- Phase 2 can sanity-check normalization by reading `_scaffold-check.md`'s rendered `data.category` / `data.tags` and confirming they are lowercased (`scaffold`, `["astro", "migration"]`) before the file is deleted.
- **Note for Phase 2:** Astro 6's `glob()` loader only walks `**/*.md`. Any `.mdx` files will be ignored silently unless the pattern is broadened. If the 84 existing notes include `.mdx`, widen the glob or convert them.
- **Note for Phase 3:** All `getCollection("blog")` calls must carry the draft filter `({ data }) => !data.draft` per PROJECT.md constraint — enforce in each consumer, not at schema level.

---
*Phase: 01-scaffold-and-content-schema*
*Plan: 03*
*Completed: 2026-04-21*

## Self-Check: PASSED

Files verified on disk:
- `src/content.config.ts`
- `src/content/blog/_scaffold-check.md`
- `.planning/phases/01-scaffold-and-content-schema/03-SUMMARY.md`

Commits verified in history:
- `e9379fb` Task 1 (feat: content.config.ts + seed note)

Task 2 is a verification-only task — the SCHE-03 script restored the seed byte-identically, so no net file change → no separate commit. The dynamic proof transcript is captured in the SUMMARY above as the audit artifact.
