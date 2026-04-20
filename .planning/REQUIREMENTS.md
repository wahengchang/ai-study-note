# Requirements

## v1 Requirements

### Scaffold (SCAF)

- [x] **SCAF-01**: Astro 6.x project initialized with Node 22.12+/24 LTS pinned via `.nvmrc`
- [x] **SCAF-02**: Tailwind 4 wired via `@tailwindcss/vite` in `astro.config.mjs`; `global.css` imports tailwindcss and the typography plugin
- [x] **SCAF-03**: `astro.config.mjs` sets `site: "https://wahengchang.github.io"`, `base: "/ai-study-note"`, `trailingSlash: "always"`, `build.format: "directory"`
- [x] **SCAF-04**: Old Quartz files removed (`quartz/`, `quartz.config.ts`, `quartz.layout.ts`, Quartz scripts in `package.json`, Quartz-specific gitignore entries)

### Content Schema (SCHE)

- [ ] **SCHE-01**: `src/content.config.ts` at `src/` root defines `blog` collection via `glob()` loader
- [ ] **SCHE-02**: Zod schema validates `{ title, description, pubDate, category, tags, draft }` with `.toLowerCase().trim()` normalization on category/tags
- [ ] **SCHE-03**: Schema fails the build on malformed frontmatter (no silent defaults for required fields)

### Content Migration (MIGR)

- [ ] **MIGR-01**: All 84 existing notes moved from `content/` → `src/content/blog/` preserving slug-equivalent filenames
- [ ] **MIGR-02**: Every migrated note has complete frontmatter matching the Zod schema (title, description, pubDate, category, tags, draft)
- [ ] **MIGR-03**: Obsidian wikilinks and Smart Columns (`:::col`) converted to standard Markdown or removed; no legacy syntax left
- [ ] **MIGR-04**: `astro build` succeeds with zero schema validation errors against migrated content
- [ ] **MIGR-05**: Old `content/` directory removed after migration verified

### Layouts & Components (LAYO)

- [ ] **LAYO-01**: `BaseLayout.astro` renders `<head>`, `Header`, `Footer`, and `<slot />`
- [ ] **LAYO-02**: `PostLayout.astro` wraps `BaseLayout`, renders post metadata and a `prose` slot for the Markdown body
- [ ] **LAYO-03**: `Header.astro` and `Footer.astro` exist, use `import.meta.env.BASE_URL` for every link
- [ ] **LAYO-04**: `PostList.astro` is a shared card component consumed by blog index, category pages, and tag pages
- [ ] **LAYO-05**: Visual design matches the lean brutalist direction from `docs/visual-guideline.md` (black bg, orange accent, monospace-tolerant body)

### Routes (ROUT)

- [ ] **ROUT-01**: `/` home page (`src/pages/index.astro`) renders, links into the blog
- [ ] **ROUT-02**: `/404` page (`src/pages/404.astro`) renders
- [ ] **ROUT-03**: `/blog/` index page lists all published posts (drafts filtered)
- [ ] **ROUT-04**: `/blog/<slug>/` post detail via `[...slug].astro` using `getStaticPaths` + `render(post)`
- [ ] **ROUT-05**: `/categories/<category>/` dynamic route generated from unique categories
- [ ] **ROUT-06**: `/tags/<tag>/` dynamic route generated from deduped flat tag list
- [ ] **ROUT-07**: Every `getCollection("blog", ...)` call filters `({ data }) => !data.draft` — no exceptions

### Base-Path Discipline (BASE)

- [ ] **BASE-01**: No hardcoded `/blog/`, `/categories/`, `/tags/`, or asset paths anywhere in source
- [ ] **BASE-02**: Internal links constructed via `${import.meta.env.BASE_URL}...` idiom
- [ ] **BASE-03**: Static assets (favicon, og-image, etc.) loaded through the base-prefixed URL

### Deploy (DEPL)

- [ ] **DEPL-01**: `.github/workflows/deploy.yml` uses `withastro/action@v6` (build) and `actions/deploy-pages@v5` (deploy)
- [ ] **DEPL-02**: Workflow triggers on push to `main` and `workflow_dispatch`
- [ ] **DEPL-03**: Workflow has `pages: write` and `id-token: write` permissions plus `pages` concurrency group
- [ ] **DEPL-04**: README or docs note the one-time manual step: Settings → Pages → Source = GitHub Actions
- [ ] **DEPL-05**: After merge to main, CI builds and deploys green, and the live URL serves the migrated content

### Verification (VERI)

- [ ] **VERI-01**: `npm run build` completes locally with zero errors
- [ ] **VERI-02**: `npm run dev` serves the site locally; spot-check home, blog index, a post, a category, a tag
- [ ] **VERI-03**: Live site at https://wahengchang.github.io/ai-study-note/ renders the same content set as Quartz did, with CSS loading correctly (no base-path 404s)
- [ ] **VERI-04**: `CLAUDE.md` updated so Quartz references point to the Astro workflow instead

## v2 Requirements (deferred)

- Custom `RelatedNotes` component ported to Astro (nice-to-have; not blocking)
- RSS feed via `@astrojs/rss`
- Sitemap via `@astrojs/sitemap`
- OpenGraph image generation for posts

## Out of Scope

- **SSR / runtime server** — GitHub Pages serves static files only
- **Authentication, comments, analytics, search, remote CMS** — YAGNI for a personal notes site
- **Pagination, dark-mode toggle, View Transitions** — not needed for v1
- **i18n** — can be added via Astro's built-in `i18n` if/when multi-language content is authored
- **Preserving Obsidian syntax** (Smart Columns `:::col`, wikilinks) — standardizing on plain Markdown during migration
- **URL-level redirects from old Quartz paths** — if route shape matches, URLs stay valid; no redirect layer needed

## Traceability

<!-- Populated by roadmapper: maps every REQ-ID to exactly one phase. -->

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCAF-01 | Phase 1 | Complete |
| SCAF-02 | Phase 1 | Complete |
| SCAF-03 | Phase 1 | Complete |
| SCAF-04 | Phase 1 | Complete |
| SCHE-01 | Phase 1 | Pending |
| SCHE-02 | Phase 1 | Pending |
| SCHE-03 | Phase 1 | Pending |
| MIGR-01 | Phase 2 | Pending |
| MIGR-02 | Phase 2 | Pending |
| MIGR-03 | Phase 2 | Pending |
| MIGR-04 | Phase 2 | Pending |
| MIGR-05 | Phase 2 | Pending |
| LAYO-01 | Phase 3 | Pending |
| LAYO-02 | Phase 3 | Pending |
| LAYO-03 | Phase 3 | Pending |
| LAYO-04 | Phase 3 | Pending |
| LAYO-05 | Phase 3 | Pending |
| ROUT-01 | Phase 3 | Pending |
| ROUT-02 | Phase 3 | Pending |
| ROUT-03 | Phase 3 | Pending |
| ROUT-04 | Phase 3 | Pending |
| ROUT-05 | Phase 3 | Pending |
| ROUT-06 | Phase 3 | Pending |
| ROUT-07 | Phase 3 | Pending |
| BASE-01 | Phase 3 | Pending |
| BASE-02 | Phase 3 | Pending |
| BASE-03 | Phase 3 | Pending |
| DEPL-01 | Phase 4 | Pending |
| DEPL-02 | Phase 4 | Pending |
| DEPL-03 | Phase 4 | Pending |
| DEPL-04 | Phase 4 | Pending |
| DEPL-05 | Phase 5 | Pending |
| VERI-01 | Phase 5 | Pending |
| VERI-02 | Phase 5 | Pending |
| VERI-03 | Phase 5 | Pending |
| VERI-04 | Phase 5 | Pending |

**Coverage:** 36/36 v1 requirements mapped to exactly one phase.
