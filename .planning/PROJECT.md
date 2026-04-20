# AI Study Note — Astro Migration

## What This Is

A personal digital garden of AI study notes, published at https://wahengchang.github.io/ai-study-note/. Content is authored in Markdown, built to a static site, and deployed to GitHub Pages. This milestone replaces the current Quartz v4 engine with Astro 6.x while preserving all existing content.

## Core Value

Every existing note remains readable at its equivalent URL on the live site after the framework swap. The site builds, deploys, and renders correctly on GitHub Pages — if that fails, nothing else matters.

## Requirements

### Validated

<!-- Shipped and confirmed valuable (carried over from Quartz era). -->

- ✓ Markdown-authored notes with frontmatter — existing content in `content/`
- ✓ Static hosting on GitHub Pages at `/ai-study-note` base path — live site
- ✓ Category + tag organization of notes — existing in Quartz
- ✓ Lean brutalist visual direction (black bg, orange accent, monospace-friendly) — `docs/visual-guideline.md`

### Active

<!-- Current scope. Building toward these. -->

- [ ] Replace Quartz v4 with Astro 6.x as the build engine
- [ ] Use Tailwind 4 via `@tailwindcss/vite` (not `@astrojs/tailwind`)
- [ ] Define type-safe Content Collection schema via Zod (title, description, pubDate, category, tags, draft)
- [ ] Migrate all 84 existing notes from `content/` to `src/content/blog/` with normalized frontmatter
- [ ] Build base layout, post layout, header, footer, post-list components
- [ ] Generate dynamic routes for blog posts, category pages, tag pages
- [ ] Always filter drafts in every `getCollection` call
- [ ] Use `import.meta.env.BASE_URL` for all internal links (never hardcode `/blog/`)
- [ ] Deploy pipeline via `withastro/action@v6` → `actions/deploy-pages@v5`
- [ ] Remove Quartz files (`quartz/`, `quartz.config.ts`, `quartz.layout.ts`, Quartz scripts in `package.json`)
- [ ] Verify live deployment renders migrated content correctly at the existing URL

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- SSR / runtime server — static-first architecture; GitHub Pages only serves static files
- Authentication, comments, user accounts — no backend
- Search, analytics, remote CMS — YAGNI for a personal notes site
- Pagination, dark mode toggle, View Transitions — YAGNI for v1
- i18n — can be added later via Astro's built-in `i18n` config
- Preserving Quartz-specific syntax (Smart Columns `:::col`, Obsidian wikilinks) — convert or drop during migration; Markdown + standard Astro components only
- URL-compatible redirects from old Quartz paths — if the new build emits the same `/category/slug/` routes, URLs stay valid; no redirect layer needed

## Context

- **Current state:** Quartz v4.5.2 site with 84 notes under `content/`, custom SCSS restyled to lean brutalist, custom `RelatedNotes` component, homepage redesign completed on main.
- **Why the swap:** Astro offers type-safe Content Collections, a saner Tailwind 4 integration, zero-JS-by-default defaults, and first-party GitHub Pages action. Less custom Quartz-plugin maintenance.
- **Branch:** Work happens on `feat/astro-migration`. `main` keeps the working Quartz site live until the Astro branch is verified and merged.
- **Project Pages site:** Lives at `https://wahengchang.github.io/ai-study-note/` — needs both `site` and `base` in `astro.config.mjs`.
- **Content shape:** Existing notes use various frontmatter conventions and may include Obsidian wikilinks and Smart Columns. Migration must normalize frontmatter to the new Zod schema.
- **Known deploy failure mode:** Hardcoded `/path` links pass local dev but 404 on Pages. Enforce `${import.meta.env.BASE_URL}` discipline everywhere.

## Constraints

- **Framework**: Astro 6.x — dropped Node 18/20; requires Node 22.12+ or 24 LTS.
- **Styling**: Tailwind 4 via `@tailwindcss/vite` — `@astrojs/tailwind` is deprecated; do not use.
- **Typography**: `@tailwindcss/typography` for `prose` on rendered Markdown bodies.
- **Content schema**: Zod-validated; `category`/`tags` normalized with `.toLowerCase().trim()` to prevent route collisions.
- **URL shape**: `trailingSlash: "always"` + `build.format: "directory"` to match GitHub Pages static serving.
- **Base path**: `/ai-study-note` — every internal link routes through `import.meta.env.BASE_URL`.
- **Draft filter**: Every `getCollection("blog", ...)` call must pass `({ data }) => !data.draft`. No exceptions.
- **Deploy**: `withastro/action@v6` → `actions/deploy-pages@v5` via GitHub Actions; manual one-time step: Settings → Pages → Source = GitHub Actions.

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Astro 6.x over alternatives (Next static, Eleventy, Hugo) | Content Collections + Zod give build-time type safety; first-party Pages action; zero-JS default | — Pending |
| Tailwind 4 via `@tailwindcss/vite` | `@astrojs/tailwind` is deprecated; Tailwind 4 is CSS-first (no JS config) | — Pending |
| `src/content.config.ts` at `src/` root (not `src/content/`) | Astro 6 convention — legacy `src/content/config.ts` no longer resolved | — Pending |
| Schema-level `.toLowerCase().trim()` on category/tags | Prevents route-collision bugs when `getStaticPaths` dedupes taxonomies | — Pending |
| All internal links use `import.meta.env.BASE_URL` | Hardcoded paths 404 on deployed GitHub Pages (works locally) — most common deploy failure | — Pending |
| Drop Obsidian-specific syntax (Smart Columns, wikilinks) during migration | Keep migration scope bounded; standard Markdown is the lowest-friction path | — Pending |
| Fresh planning (no codebase map of Quartz) | New architecture is fully specified; reverse-engineering Quartz setup adds no value | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-21 after initialization on `feat/astro-migration` branch*
