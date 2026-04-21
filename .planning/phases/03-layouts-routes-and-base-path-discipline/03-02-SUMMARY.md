---
phase: 03-layouts-routes-and-base-path-discipline
plan: 02
subsystem: ui
tags: [astro, content-collections, static-paths, routes, blog, base-path]

# Dependency graph
requires:
  - phase: 03-01
    provides: "BaseLayout, PostLayout, PostList component with CollectionEntry<'blog'> prop contracts"
  - phase: 02-content-migration
    provides: "72 non-draft posts under src/content/blog/ with normalized frontmatter and glob-based loader"
provides:
  - "src/pages/index.astro — Home page with hero + 6 most recent non-draft posts rendered via PostList"
  - "src/pages/blog/index.astro — Blog index listing all 72 non-draft posts, sorted by pubDate descending"
  - "src/pages/blog/[...slug].astro — Static-dynamic route using getStaticPaths + render(post) + PostLayout, emitting one HTML file per non-draft post"
affects: [03-03-taxonomy-routes, 04-deploy, 05-live-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Home + blog-index + post-detail page shells built from Plan 01 layout/component primitives — no duplicated markup"
    - "getStaticPaths + params.slug = post.id pattern for filename-based dynamic routing"
    - "Astro 6 render(post) from astro:content for Markdown body rendering inside PostLayout slot"
    - "MANDATORY draft filter ({ data }) => !data.draft applied at every getCollection call site (3/3 files)"
    - "All internal links built from import.meta.env.BASE_URL (zero hardcoded /blog/, /categories/, /tags/, /assets/ paths in Plan 02 files)"

key-files:
  created:
    - "src/pages/blog/index.astro"
    - "src/pages/blog/[...slug].astro"
  modified:
    - "src/pages/index.astro"
    - "src/content/blog/utm-set-ubuntu.md"

key-decisions:
  - "Home renders 6 most recent posts (lower end of 6-10 range per CONTEXT.md) — dense and fast"
  - "Blog index renders all 72 posts on a single page (pagination deferred to v2 per CONTEXT.md)"
  - "post.id used as slug in getStaticPaths params — Astro glob loader exposes filename-without-extension"
  - "render(post) imported from astro:content (Astro 6 API); returns { Content } component that runs the post body through the remark/rehype pipeline"
  - "Pre-existing ../assets/ image references in utm-set-ubuntu.md normalized to /ai-study-note/assets/ — matches the absolute-path style already used elsewhere in the same file (Rule 3 auto-fix)"

patterns-established:
  - "Static-dynamic post route pattern: getStaticPaths returns { params: { slug: post.id }, props: { post } } and passes post to PostLayout, which in turn renders <Content /> in the slot"
  - "Draft filter at the getStaticPaths level ensures draft posts never produce HTML pages (not just hidden in lists)"
  - "Image references in Markdown bodies should use /ai-study-note/assets/<file>.png absolute paths — matches public/ directory serving and avoids Astro's build-time image resolver looking under src/"

requirements-completed: [ROUT-01, ROUT-03, ROUT-04, ROUT-07]

# Metrics
duration: 3min
completed: 2026-04-21
---

# Phase 03 Plan 02: Home, Blog Index, and Post Detail Routes Summary

**Three primary reading routes wired to Plan 01 layouts — `/` hero + 6 recent posts, `/blog/` full list of 72 non-draft posts, and `/blog/<slug>/` Markdown-rendered post detail via `getStaticPaths` + `render(post)`.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-20T17:41:44Z
- **Completed:** 2026-04-20T17:44:23Z
- **Tasks:** 3
- **Files modified:** 4 (2 created, 2 modified — including 1 content fix)

## Accomplishments

- `src/pages/index.astro` replaced the Phase 2 scaffold placeholder with a real home page: hero (site title + tagline), "Browse all notes →" CTA linking to `${base}blog/`, and a "Recent" PostList of the 6 most recent non-draft posts.
- `src/pages/blog/index.astro` renders every non-draft post (72 confirmed) via the shared PostList, sorted by `pubDate` descending, with a muted mono post-count line.
- `src/pages/blog/[...slug].astro` is the static-dynamic detail route. `getStaticPaths` returns one entry per non-draft post using `post.id` as the slug, and `render(post)` from `astro:content` produces the `<Content />` component that streams through `PostLayout`'s prose slot.
- All three `getCollection("blog", …)` call sites carry the mandatory `({ data }) => !data.draft` filter — draft posts neither list nor generate HTML.
- Zero hardcoded internal paths in any Plan 02 file: `grep -rE 'href="/(blog|categories|tags|assets)/' src/pages/index.astro src/pages/blog/index.astro 'src/pages/blog/[...slug].astro'` returns 0 matches.
- `npm run build` exits 0 and emits **104 total pages**, including **72 post detail pages** under `dist/blog/<slug>/index.html` — one for every non-draft post, zero rendering failures.

## Task Commits

Each task was committed atomically (with `--no-verify` per the parallel-execution directive, since Plan 03-03 was running concurrently):

1. **Task 1: Replace placeholder index.astro with home page** — `66d1ca5` (feat)
2. **Task 2: Create blog index at /blog/** — `0f0ddb7` (feat)
3. **Task 3: Create dynamic post detail route at /blog/[...slug]/** — `6d6c6be` (feat)
4. **Rule 3 auto-fix: normalize image paths in utm-set-ubuntu.md** — `1ade74b` (fix)

**Plan metadata:** committed separately after SUMMARY creation (see final commit in git log).

## Files Created/Modified

- `src/pages/index.astro` — Overwritten. Home page with hero + "Recent" PostList of 6 most recent non-draft posts. Uses BaseLayout, PostList, and `${base}blog/` CTA.
- `src/pages/blog/index.astro` — Created. Blog index listing every non-draft post via PostList, sorted by pubDate desc, with a post-count line.
- `src/pages/blog/[...slug].astro` — Created. Static-dynamic route. `getStaticPaths` emits one entry per non-draft post (`params.slug = post.id`). `render(post)` produces `<Content />`, wrapped in `<PostLayout post={post}>`.
- `src/content/blog/utm-set-ubuntu.md` — Fixed (Rule 3). Replaced 4 `../assets/<file>.png` Markdown image refs with `/ai-study-note/assets/<file>.png` to match the other image in the same file and avoid Astro's build-time image resolver looking under `src/assets/`.

## URL Shape Confirmed

- Home: `/ai-study-note/` → `dist/index.html`
- Blog index: `/ai-study-note/blog/` → `dist/blog/index.html`
- Post detail (example): `/ai-study-note/blog/agent-teams-guide/` → `dist/blog/agent-teams-guide/index.html`
- All 72 non-draft posts emit matching `dist/blog/<slug>/index.html` files.

## Draft Filter Coverage (for Plan 02 files)

- `src/pages/index.astro`: ✓ `({ data }) => !data.draft`
- `src/pages/blog/index.astro`: ✓ `({ data }) => !data.draft`
- `src/pages/blog/[...slug].astro`: ✓ `({ data }) => !data.draft` (inside `getStaticPaths`)
- **Coverage: 3/3** — satisfies ROUT-07 for this plan's files.

## Post Counts

- Home recent-posts section: 6 (via `.slice(0, 6)` after pubDate-desc sort).
- Blog index total: 72 (every non-draft post in `src/content/blog/`).
- Build-emitted post detail pages: 72 (matches the blog index count — no renders failed).

## Decisions Made

- **6 recent posts on home** — Plan gave discretion for 6-10; 6 keeps the home compact and visually dense, consistent with the brutalist direction in `docs/visual-guideline.md`.
- **No pagination on `/blog/`** — 72 posts is fine as a single page for v1 per CONTEXT.md's deferred list; add pagination only if the note corpus grows substantially.
- **Kept post body `<Content />` inside the existing `PostLayout` `<div class="prose prose-invert max-w-none">` slot** — no need for `[...slug].astro` to re-declare typography classes; they already live in Plan 01's PostLayout.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Normalized `../assets/` image paths in utm-set-ubuntu.md**
- **Found during:** Task 3 (first `npm run build` after adding the post detail route)
- **Issue:** Astro's Markdown image resolver tried to resolve `../assets/shared-folder-working.png` (and 3 sibling images) as build-time imports under `src/assets/`, which does not exist. The actual images live under `public/assets/` and the other 10 posts in the corpus already use the absolute `/ai-study-note/assets/…` pattern. Build failed with `ImageNotFound` for `../assets/shared-folder-working.png`.
- **Fix:** Replaced all 4 `![...](../assets/<file>.png)` references in `src/content/blog/utm-set-ubuntu.md` with `![...](/ai-study-note/assets/<file>.png)` — matches the absolute-path style already on line 51 of the same file and consistent with the other 10 image-containing posts.
- **Files modified:** `src/content/blog/utm-set-ubuntu.md`
- **Verification:** Re-ran `npm run build` → exits 0, 104 pages built, 72 post pages under `dist/blog/`.
- **Committed in:** `1ade74b`
- **Scope justification:** Pre-existing Phase 2 migration artifact, not caused by Plan 02 changes. However, Task 3 is the first route that actually renders post bodies, so the missing image surfaced as a blocker for Task 3's build-success acceptance criterion. Rule 3 (blocking issue) applies — a 4-line content fix unblocks the entire plan's verification gate.

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minimal. The fix touches a single Phase 2 file to make its image references consistent with the other 10 posts; no code structure change. No scope creep.

## Known Stubs

None — all three new files render real data from the `blog` collection. No hardcoded placeholders, empty arrays, or TODO markers introduced.

## Issues Encountered

- **macOS `._*` resource-fork files from UGREEN drive** continue to produce `error: non-monotonic index` warnings on every git operation. These are cosmetic only — `git add`/`git commit`/`git rev-parse` all succeed and commits are recorded correctly (same environmental noise documented in 03-01-SUMMARY).

## User Setup Required

None — no external service configuration required. All work is local codegen + content normalization.

## Next Phase Readiness

- **Plan 03-03 (categories/[category], tags/[tag], 404)** can now consume the established `getCollection` + `({ data }) => !data.draft` pattern and reuse `PostList`/`BaseLayout` to filter by category/tag. The build output already shows `/categories/*/index.html` and `/tags/*/index.html` pages (Plan 03-03 landed concurrently, disjoint file set).
- **Phase 4 (deploy pipeline)** has a working build that emits all expected routes, so the GitHub Actions workflow can point `withastro/action@v6` at the repo and expect a valid `dist/`.
- **No blockers.** `npm run build` is green; 72 post pages render; all links are base-prefixed.

## Self-Check: PASSED

**Files verified on disk:**
- FOUND: `src/pages/index.astro`
- FOUND: `src/pages/blog/index.astro`
- FOUND: `src/pages/blog/[...slug].astro`
- FOUND: `src/content/blog/utm-set-ubuntu.md` (modified)

**Commits verified in git log:**
- FOUND: `66d1ca5` (Task 1 — home page)
- FOUND: `0f0ddb7` (Task 2 — blog index)
- FOUND: `6d6c6be` (Task 3 — dynamic post route)
- FOUND: `1ade74b` (Rule 3 fix — image paths)

**Additional checks:**
- `grep -E 'href="/(blog|categories|tags|assets)/' src/pages/index.astro src/pages/blog/index.astro 'src/pages/blog/[...slug].astro'` → 0 matches
- Count of `getCollection("blog", ({ data }) => !data.draft)` lines across Plan 02 files → 3
- `find dist/blog -name 'index.html' -not -path 'dist/blog/index.html' | wc -l` → 72
- `npm run build` → exits 0, 104 pages built

---
*Phase: 03-layouts-routes-and-base-path-discipline*
*Completed: 2026-04-21*
