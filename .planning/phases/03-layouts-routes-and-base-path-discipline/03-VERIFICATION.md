---
phase: 03-layouts-routes-and-base-path-discipline
verified: 2026-04-21T09:30:00Z
status: passed
score: 8/8 must-haves verified
human_verification:
  - test: "Visual spot-check: brutalist look"
    expected: "Black (#050505) background, orange (#FF4F00) accent on hover/active, JetBrains Mono nav/metadata, Inter body text"
    why_human: "CSS class resolution and font loading cannot be confirmed without a browser render"
  - test: "404 page behavior"
    expected: "Navigating to an unknown path serves the 404.html with the BaseLayout shell intact and a working home link"
    why_human: "Static 404 routing depends on host configuration (GitHub Pages maps 404.html automatically; local preview needs --serve)"
---

# Phase 3: Layouts, Routes, and Base-Path Discipline — Verification Report

**Phase Goal:** A reader can browse the full site locally — home, blog index, individual post, category page, tag page, and 404 — with the lean brutalist look and all internal links routed through `import.meta.env.BASE_URL`.
**Verified:** 2026-04-21T09:30:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | global.css declares all 7 brutalist colors and 2 font stacks via Tailwind 4 @theme | VERIFIED | `src/styles/global.css` contains `@theme` block with `--color-bg-global`, `--color-bg-card`, `--color-border-default`, `--color-border-active`, `--color-brand-orange`, `--color-text-primary`, `--color-text-muted`, `--font-mono`, `--font-sans` |
| 2 | BaseLayout renders html shell, imports global.css, includes Header + slot + Footer | VERIFIED | `src/layouts/BaseLayout.astro` line 2 imports `../styles/global.css`; renders `<Header />`, `<slot />`, `<Footer />` |
| 3 | PostLayout wraps BaseLayout and wraps slot in `<article>` with `prose prose-invert max-w-none` | VERIFIED | `src/layouts/PostLayout.astro` line 29: `<div class="prose prose-invert max-w-none">` wrapped inside `<BaseLayout>` |
| 4 | Header and Footer build every internal link from import.meta.env.BASE_URL | VERIFIED | Both components declare `const base = import.meta.env.BASE_URL` and use template literals for all hrefs; no hardcoded paths |
| 5 | PostList is a single shared component renderable with `posts: CollectionEntry<"blog">[]` | VERIFIED | `src/components/PostList.astro` imports `CollectionEntry` type, interface declares `posts: CollectionEntry<"blog">[]`, used by index, blog/index, categories, tags pages |
| 6 | All 6 routes exist and are wired (home, blog index, post detail, category, tag, 404) | VERIFIED | `src/pages/index.astro`, `src/pages/blog/index.astro`, `src/pages/blog/[...slug].astro`, `src/pages/categories/[category].astro`, `src/pages/tags/[tag].astro`, `src/pages/404.astro` all exist and import their respective layouts |
| 7 | Every getCollection("blog") call filters drafts | VERIFIED | All 5 call sites pass `({ data }) => !data.draft` — `index.astro`, `blog/index.astro`, `blog/[...slug].astro`, `categories/[category].astro`, `tags/[tag].astro` |
| 8 | Zero hardcoded internal paths in src/ | VERIFIED | `grep -rnE 'href="/(blog|categories|tags|assets)/' src/` returns no matches |

**Score:** 8/8 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/styles/global.css` | Tailwind 4 @theme tokens | VERIFIED | 9 token declarations (7 colors + 2 fonts), `@import "tailwindcss"`, `@plugin "@tailwindcss/typography"`, no forbidden CSS rules |
| `src/layouts/BaseLayout.astro` | Html shell + Header + slot + Footer | VERIFIED | 30 lines, imports global.css, Header, Footer; renders `<slot />` in `<main>` |
| `src/layouts/PostLayout.astro` | Post detail shell with prose article | VERIFIED | Wraps BaseLayout, `prose prose-invert max-w-none` present at line 29 |
| `src/components/Header.astro` | Site nav (Home, Blog) | VERIFIED | Uses `import.meta.env.BASE_URL` for all 3 hrefs |
| `src/components/Footer.astro` | Minimal muted footer | VERIFIED | Uses `import.meta.env.BASE_URL` for home link |
| `src/components/PostList.astro` | Shared post card list | VERIFIED | Accepts `posts: CollectionEntry<"blog">[]`, links via `${base}blog/${post.id}/` |
| `src/pages/index.astro` | Home page | VERIFIED | Uses BaseLayout + PostList, getCollection with draft filter |
| `src/pages/blog/index.astro` | Blog index | VERIFIED | Uses BaseLayout + PostList, getCollection with draft filter |
| `src/pages/blog/[...slug].astro` | Post detail | VERIFIED | Uses PostLayout + render(post), getStaticPaths with draft filter |
| `src/pages/categories/[category].astro` | Category page | VERIFIED | Uses BaseLayout + PostList, dynamic getStaticPaths from unique categories |
| `src/pages/tags/[tag].astro` | Tag page | VERIFIED | Uses BaseLayout + PostList, dynamic getStaticPaths from flat tag array |
| `src/pages/404.astro` | 404 page | VERIFIED | Uses BaseLayout, links back to `{base}` |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/layouts/BaseLayout.astro` | `src/styles/global.css` | import | WIRED | Line 2: `import "../styles/global.css"` |
| `src/layouts/PostLayout.astro` | `src/layouts/BaseLayout.astro` | component wrap | WIRED | Line 3: `import BaseLayout from "./BaseLayout.astro"`, used at line 12 |
| `src/components/PostList.astro` | post detail URL | href string | WIRED | Line 16: `` href={`${base}blog/${post.id}/`} `` |
| `src/pages/index.astro` | `PostList.astro` | import + usage | WIRED | Imported line 4, used at line 27 with `posts={recent}` |
| `src/pages/blog/[...slug].astro` | `PostLayout.astro` | import + wraps Content | WIRED | Imported line 3, wraps `<Content />` at lines 19–21 |
| `src/pages/categories/[category].astro` | `PostList.astro` | import + usage | WIRED | Imported line 4, used at line 31 |
| `src/pages/tags/[tag].astro` | `PostList.astro` | import + usage | WIRED | Imported line 4, used at line 31 |
| `Header.astro` / `Footer.astro` | `import.meta.env.BASE_URL` | runtime env | WIRED | Both declare `const base = import.meta.env.BASE_URL` and use it in every href |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `src/pages/index.astro` | `recent` (6 posts) | `getCollection("blog")` filtered + sorted + sliced | Yes — reads from `src/content/blog/` collection | FLOWING |
| `src/pages/blog/index.astro` | `sorted` (all posts) | `getCollection("blog")` filtered + sorted | Yes | FLOWING |
| `src/pages/blog/[...slug].astro` | `post` (single entry) | `getStaticPaths` + `render(post)` | Yes — renders Markdown body via Content component | FLOWING |
| `src/pages/categories/[category].astro` | `posts` (filtered by category) | `getCollection` → `Set` of categories → `filter` | Yes | FLOWING |
| `src/pages/tags/[tag].astro` | `posts` (filtered by tag) | `getCollection` → `flatMap(tags)` deduped → `filter` | Yes | FLOWING |
| `src/components/PostList.astro` | `posts` prop | Passed from parent page | Receives real CollectionEntry arrays from all consumers | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Build succeeds | `npm run build` | Exit 0, "104 page(s) built in 2.09s" | PASS |
| Page count >= 100 | Build output line count | 104 pages (72 posts + home + blog/index + categories + tags + 404) | PASS |
| No hardcoded internal paths | `grep -rnE 'href="/(blog|categories|tags|assets)/' src/` | No matches | PASS |
| All getCollection calls filter drafts | grep for `!data.draft` in 5 files | All 5 call sites verified | PASS |
| global.css has @theme block | `grep -c "^@theme" src/styles/global.css` | Returns 1 | PASS |
| All 7 color tokens present | count grep matches | 9 token lines (7 colors + 2 fonts) | PASS |
| No forbidden CSS rules | `grep -Ei "box-shadow|linear-gradient|filter:.*blur"` | No matches | PASS |
| dist/_astro/*.css exists | `ls dist/_astro/` | `BaseLayout.D5vGoX3V.css` present | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| LAYO-01 | 03-01-PLAN | BaseLayout renders head, Header, Footer, slot | SATISFIED | `src/layouts/BaseLayout.astro` confirmed |
| LAYO-02 | 03-01-PLAN | PostLayout wraps BaseLayout with prose article slot | SATISFIED | `prose prose-invert max-w-none` at line 29 |
| LAYO-03 | 03-01-PLAN | Header and Footer use BASE_URL for every link | SATISFIED | Both components verified |
| LAYO-04 | 03-01-PLAN | PostList is a single shared component | SATISFIED | Used by 4 distinct pages |
| LAYO-05 | 03-01-PLAN | Visual design matches lean brutalist direction | SATISFIED (code) / NEEDS HUMAN (render) | Tokens present; visual confirmation requires browser |
| ROUT-01 | 03-02-PLAN | `/` home page renders, links into blog | SATISFIED | `src/pages/index.astro` exists, builds, links to `${base}blog/` |
| ROUT-02 | 03-03-PLAN | `/404` page renders | SATISFIED | `src/pages/404.astro` exists and builds |
| ROUT-03 | 03-02-PLAN | `/blog/` index lists all published posts | SATISFIED | `src/pages/blog/index.astro` with draft filter confirmed |
| ROUT-04 | 03-02-PLAN | `/blog/<slug>/` post detail via getStaticPaths + render | SATISFIED | `[...slug].astro` confirmed |
| ROUT-05 | 03-03-PLAN | `/categories/<category>/` dynamic route | SATISFIED | `[category].astro` confirmed |
| ROUT-06 | 03-03-PLAN | `/tags/<tag>/` dynamic route | SATISFIED | `[tag].astro` confirmed |
| ROUT-07 | 03-02-PLAN | Every getCollection call filters !data.draft | SATISFIED | All 5 call sites verified |
| BASE-01 | 03-01-PLAN | No hardcoded internal paths in source | SATISFIED | grep returns zero matches |
| BASE-02 | 03-01-PLAN | Internal links via ${import.meta.env.BASE_URL} | SATISFIED | All hrefs use `${base}` template literals |
| BASE-03 | 03-01-PLAN | Static assets loaded through base-prefixed URL | SATISFIED | Favicon href: `${base}favicon.svg` in BaseLayout |

**Note on traceability table:** The REQUIREMENTS.md prose section (`[x]`) marks all 15 requirements complete, but the traceability table at the bottom still shows ROUT-01..07 and BASE-01..03 as "Pending". The table was not updated when those routes were implemented. The code evidence confirms all requirements are satisfied; the table is a documentation lag, not a code gap.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | — | — | No anti-patterns found |

No TODOs, FIXMEs, placeholders, stub returns, or hardcoded empty data found in the phase files.

---

### Human Verification Required

#### 1. Brutalist visual output

**Test:** Run `npm run quartz -- build --serve` (or the Astro equivalent `npm run build && npx serve dist/`) and open the site in a browser. Check home, a blog post, a category page, a tag page, and the 404.
**Expected:** Black `#050505` background throughout; orange `#FF4F00` on nav hover and post card hover borders; JetBrains Mono for nav/metadata text; Inter for body prose; cards in a 1/2/3-column responsive grid; no gradients, no shadows, no blur effects.
**Why human:** Tailwind 4 tree-shakes unused utilities at build time and fonts load from the browser — neither is verifiable by static grep alone.

#### 2. 404 page routing

**Test:** Serve the dist/ directory and navigate to a non-existent path (e.g., `/ai-study-note/does-not-exist/`).
**Expected:** The 404.html page renders with the BaseLayout shell (header nav visible, footer visible) and the "Not found." heading in orange; the "Back home" link returns to `/ai-study-note/`.
**Why human:** Static 404 routing behaviour depends on the HTTP server configuration — GitHub Pages serves `404.html` automatically, but local preview tools vary.

---

### Gaps Summary

No gaps. All 8 observable truths are verified, all 12 artifacts exist and are substantive and wired, all 14 phase-3 requirement IDs are satisfied in code. The build exits 0 and produces 104 pages (exceeding the 100-page threshold). Two items are flagged for human verification as standard practice for a visual/routing phase, but neither blocks goal achievement.

---

_Verified: 2026-04-21T09:30:00Z_
_Verifier: Claude (gsd-verifier)_
