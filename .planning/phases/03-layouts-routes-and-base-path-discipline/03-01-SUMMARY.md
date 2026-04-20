---
phase: 03-layouts-routes-and-base-path-discipline
plan: 01
subsystem: ui
tags: [astro, tailwind-4, tailwind-typography, layouts, components, brutalist]

# Dependency graph
requires:
  - phase: 02-content-migration
    provides: "src/content.config.ts schema + 72 migrated posts under src/content/blog/"
  - phase: 01-astro-foundation
    provides: "astro.config.mjs (base=/ai-study-note, trailingSlash=always), Tailwind 4 via vite plugin, global.css with Tailwind imports"
provides:
  - "Tailwind 4 @theme block with 7 brutalist color tokens and 2 font stacks (generates bg-bg-global, text-brand-orange, border-border-default, font-mono, font-sans utilities)"
  - "BaseLayout.astro — html shell with head meta, base-prefixed favicon, global.css import, Header + slot + Footer"
  - "PostLayout.astro — wraps BaseLayout with post header (title, description, meta row) and prose prose-invert article slot"
  - "Header.astro — site nav (Home, Blog) using import.meta.env.BASE_URL"
  - "Footer.astro — minimal muted copyright + base-prefixed home link"
  - "PostList.astro — shared card grid consuming CollectionEntry<'blog'>[], used by home/blog-index/category/tag pages"
affects: [03-02-pages, 03-03-taxonomy-routes, 04-deploy, 05-live-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tailwind 4 CSS-first config via @theme directive (no JS config file)"
    - "All internal URLs built as `${import.meta.env.BASE_URL}segment/` — zero hardcoded paths"
    - "Single shared PostList component — no duplicated card markup across pages"
    - "PostLayout composes BaseLayout rather than duplicating html shell"
    - "Article body uses `prose prose-invert max-w-none` for Tailwind Typography dark mode"

key-files:
  created:
    - "src/layouts/BaseLayout.astro"
    - "src/layouts/PostLayout.astro"
    - "src/components/Header.astro"
    - "src/components/Footer.astro"
    - "src/components/PostList.astro"
  modified:
    - "src/styles/global.css"

key-decisions:
  - "Tailwind 4 @theme block generates utility classes at build time — one source of truth for tokens"
  - "Header nav limited to Home and Blog (no top-level categories/tags index pages in this phase)"
  - "post.id used as slug — filename-based, no custom slug logic"
  - "prose-invert applied only in PostLayout article slot (index/card pages use Tailwind utilities, not prose)"
  - "Favicon href uses ${base}favicon.svg — file may not exist yet, harmless 404 until future phase adds it"

patterns-established:
  - "Base-URL idiom: `const base = import.meta.env.BASE_URL;` then `${base}blog/${post.id}/`"
  - "Card list component pattern: accept `posts: CollectionEntry<'blog'>[]` + optional `title?: string`"
  - "Layout composition: PostLayout wraps BaseLayout rather than duplicating html shell"
  - "Theme tokens via @theme directive — add new tokens by appending CSS custom properties, no tailwind.config.js"

requirements-completed: [LAYO-01, LAYO-02, LAYO-03, LAYO-04, LAYO-05]

# Metrics
duration: 2min
completed: 2026-04-21
---

# Phase 03 Plan 01: Brutalist Foundation + Shared UI Primitives Summary

**Tailwind 4 @theme block with 7 brutalist color tokens, BaseLayout/PostLayout, and Header/Footer/PostList components — all internal URLs route through `import.meta.env.BASE_URL`.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-20T17:36:32Z
- **Completed:** 2026-04-20T17:38:32Z
- **Tasks:** 3
- **Files modified:** 6 (1 modified, 5 created)

## Accomplishments

- Tailwind 4 `@theme` block declares all 7 brutalist colors + 2 font stacks from `docs/visual-guideline.md` as CSS-first tokens, auto-generating utility classes (`bg-bg-global`, `text-brand-orange`, `border-border-default`, `font-mono`, `font-sans`).
- BaseLayout provides the single html shell (head meta, favicon, global.css import, Header + main slot + Footer) every page in Phase 3 will consume.
- PostLayout composes BaseLayout with post metadata header and `prose prose-invert max-w-none` article slot — the only surface using Tailwind Typography's dark-mode variant.
- PostList is a single shared card grid (1/2/3 column responsive) consumed by home, blog index, category pages, and tag pages — no duplicated card markup.
- Zero hardcoded internal paths across all 5 new files; every link constructs via `` `${import.meta.env.BASE_URL}…` ``.
- `npm run build` exits 0 after each task.

## Task Commits

Each task was committed atomically:

1. **Task 1: Declare Tailwind 4 brutalist theme tokens in global.css** — `7c9134f` (feat)
2. **Task 2: Create Header, Footer, and PostList shared components** — `12c69d0` (feat)
3. **Task 3: Create BaseLayout and PostLayout** — `9bfe3e0` (feat)

**Plan metadata:** `a982fc9` (docs: complete plan — SUMMARY + STATE + ROADMAP + REQUIREMENTS)

## Files Created/Modified

- `src/styles/global.css` — Replaced single-line Tailwind import with `@theme` block (7 colors + 2 font stacks) plus minimal html/body reset (14px base, sans body, near-black background).
- `src/layouts/BaseLayout.astro` — Props `{ title, description? }`. Imports `../styles/global.css`. Renders `<html lang="en">` with head meta + base-prefixed favicon and `<body>` with Header, main slot, Footer.
- `src/layouts/PostLayout.astro` — Props `{ post: CollectionEntry<"blog"> }`. Wraps BaseLayout with post header (h1 title, description, pubDate + category link + tag links) and `<div class="prose prose-invert max-w-none">` around slot.
- `src/components/Header.astro` — Site nav: site title link + Home/Blog list items. All hrefs built from `import.meta.env.BASE_URL`.
- `src/components/Footer.astro` — Minimal muted footer: copyright + home link.
- `src/components/PostList.astro` — Props `{ posts: CollectionEntry<"blog">[], title? }`. Renders 1/2/3-col responsive grid of card `<li>` items with title, description, pubDate, category, and first 3 tags.

## Component Prop Shapes (for Plan 02 / Plan 03 consumers)

```typescript
// BaseLayout.astro
interface Props {
  title: string;
  description?: string; // defaults to "AI study notes — a personal digital garden."
}

// PostLayout.astro
interface Props {
  post: CollectionEntry<"blog">;
}

// PostList.astro
interface Props {
  posts: CollectionEntry<"blog">[];
  title?: string;
}
```

## Theme Tokens Declared

**Colors (7):**
- `--color-bg-global: #050505` → `bg-bg-global`
- `--color-bg-card: #000000` → `bg-bg-card`
- `--color-border-default: #333333` → `border-border-default`
- `--color-border-active: #FF4F00` → `border-border-active`
- `--color-brand-orange: #FF4F00` → `text-brand-orange`, `border-brand-orange`, etc.
- `--color-text-primary: #E5E5E5` → `text-text-primary`
- `--color-text-muted: #737373` → `text-text-muted`

**Font stacks (2):**
- `--font-mono: "JetBrains Mono", "Fira Code", ui-monospace, monospace` → `font-mono`
- `--font-sans: Inter, Geist, system-ui, sans-serif` → `font-sans`

## Decisions Made

- **Tailwind 4 CSS-first config via `@theme`** — single source of truth in `global.css`; no `tailwind.config.js` needed. New tokens are added by appending CSS custom properties.
- **Header nav constrained to Home + Blog** — Phase 3 scope excludes top-level `/categories/` and `/tags/` index pages; category/tag pages are only reachable via post metadata links.
- **`prose-invert` scoped to PostLayout only** — index/card surfaces use Tailwind utilities directly; only long-form Markdown bodies need the typography plugin's dark palette.
- **Favicon href uses `${base}favicon.svg`** — file not yet present in `public/`, but the href is future-proof. Produces a harmless 404 in dev until a future phase adds the asset.
- **`post.id` as slug** — Astro 6's Content Collections expose filename-without-extension as `post.id`; no custom slug logic needed for URL construction.

## Deviations from Plan

None — plan executed exactly as written. All three tasks used the verbatim code blocks from the plan; acceptance criteria and automated verifications all passed on first attempt; `npm run build` passed after each task.

## Issues Encountered

- **macOS `._*` resource-fork files from UGREEN drive** produce `error: non-monotonic index` warnings on every git operation. These are **cosmetic only** — git commands still succeed and commits are recorded correctly. Not a plan deviation; pre-existing environment noise already present before this plan.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Ready for Plan 02 (home, blog index, post detail pages):**
  - `src/pages/index.astro` can import `BaseLayout` + `PostList` with 6 most recent non-draft posts.
  - `src/pages/blog/index.astro` can import `BaseLayout` + `PostList` with all non-draft posts sorted by pubDate desc.
  - `src/pages/blog/[...slug].astro` can import `PostLayout`, pass `post`, and render body via `<Content />` from `astro:content`.
- **Ready for Plan 03 (category, tag, 404):**
  - `src/pages/categories/[category].astro` can import `BaseLayout` + `PostList` filtered by category.
  - `src/pages/tags/[tag].astro` can import `BaseLayout` + `PostList` filtered by tag.
  - PostLayout already links to `${base}categories/<cat>/` and `${base}tags/<tag>/` — those routes are Plan 03's responsibility.
- **No blockers.** Build passes; theme tokens resolve; all file paths stable.

## Self-Check: PASSED

**Files verified on disk:**
- FOUND: `src/styles/global.css`
- FOUND: `src/layouts/BaseLayout.astro`
- FOUND: `src/layouts/PostLayout.astro`
- FOUND: `src/components/Header.astro`
- FOUND: `src/components/Footer.astro`
- FOUND: `src/components/PostList.astro`

**Commits verified in git log:**
- FOUND: `7c9134f` (Task 1 — global.css @theme block)
- FOUND: `12c69d0` (Task 2 — Header/Footer/PostList)
- FOUND: `9bfe3e0` (Task 3 — BaseLayout/PostLayout)

**Additional checks:**
- `grep -rE 'href="/(blog|categories|tags|assets)/' src/` → zero matches
- `grep -c "^@theme" src/styles/global.css` → 1
- `npm run build` → exits 0

---
*Phase: 03-layouts-routes-and-base-path-discipline*
*Completed: 2026-04-21*
