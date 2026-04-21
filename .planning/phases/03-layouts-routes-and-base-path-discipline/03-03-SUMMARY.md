---
plan: 03-03
phase: 03-layouts-routes-and-base-path-discipline
status: complete
completed: 2026-04-21
requirements: [ROUT-02, ROUT-05, ROUT-06, ROUT-07, BASE-01, BASE-02, BASE-03]
---

# Plan 03-03: Taxonomy Routes + 404 + Base-Path Audit — Summary

## Outcome

Added `/categories/<category>/`, `/tags/<tag>/`, and `/404` pages using the shared PostList component. All internal links routed through `import.meta.env.BASE_URL`. Draft filter present in every `getCollection("blog", ...)` call. Build produces 104 pages total (72 posts, 1 home, 1 blog index, 6 category pages, 22 tag pages, 1 404, 1 post-detail index, plus misc).

## Commits

- `1a0f282` — feat(03-03): add dynamic categories/[category] route
- `17b3f29` — feat(03-03): add dynamic tags/[tag] route and brutalist 404

## Files Created

- `src/pages/categories/[category].astro` — unique categories via getStaticPaths, filtered PostList
- `src/pages/tags/[tag].astro` — flat tag dedupe via Set, filtered PostList
- `src/pages/404.astro` — brutalist 404 with base-prefixed link home

## Audit Results

**Hardcoded path grep:** `grep -rnE 'href="/(blog|categories|tags|assets)/' src/` → zero matches. All internal links use `${base}...` idiom.

**Draft filter audit:** 5 `getCollection("blog"` calls found across `src/pages/`, every one includes `({ data }) => !data.draft`. Zero gaps.

**Build verification:** `npm run build` exits 0. 104 pages generated.

## Deviations

- Original plan had 3 tasks; executor hit usage limit after Tasks 1-2 completed (categories + tags/404). Task 3 (base-path audit) was executed inline by the orchestrator after resumption — same checks, same result.

## Requirements Closed

- **ROUT-02** — /404 page renders
- **ROUT-05** — /categories/<category>/ dynamic route
- **ROUT-06** — /tags/<tag>/ dynamic route
- **ROUT-07** — draft filter on every getCollection call (cross-plan enforcement, verified here)
- **BASE-01** — no hardcoded `/blog/`, `/categories/`, `/tags/`, `/assets/` in src/
- **BASE-02** — all internal links use `${import.meta.env.BASE_URL}...`
- **BASE-03** — static assets (favicon etc) resolved through base-prefixed URL
