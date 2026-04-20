# Roadmap: AI Study Note — Astro Migration

## Overview

Replace the Quartz v4 engine with Astro 6.x while preserving all 84 existing notes and keeping the live GitHub Pages site at `https://wahengchang.github.io/ai-study-note/` functional. The migration proceeds in strict build order: land Astro scaffolding and a type-safe content schema first, migrate content to fit that schema, build layouts and routes against the migrated content, then stand up the deploy pipeline and verify the live site matches the old one.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Scaffold and Content Schema** - Astro 6 + Tailwind 4 project boots with a Zod-validated `blog` collection and Quartz files removed
- [ ] **Phase 2: Content Migration** - All 84 notes moved to `src/content/blog/` with schema-compliant frontmatter and legacy Obsidian syntax removed
- [ ] **Phase 3: Layouts, Routes, and Base-Path Discipline** - Full page set (home, blog index, post detail, category, tag, 404) renders locally with shared layouts and base-prefixed links
- [ ] **Phase 4: Deploy Pipeline** - GitHub Actions workflow builds and deploys the Astro site to Pages on push to `main`
- [ ] **Phase 5: Live Verification and Docs Update** - Local build is green, live site serves migrated content with no base-path 404s, and project docs point at the Astro workflow

## Phase Details

### Phase 1: Scaffold and Content Schema
**Goal**: Astro 6 builds a working shell on the `feat/astro-migration` branch with a type-safe `blog` collection definition; the Quartz engine is removed from the tree.
**Depends on**: Nothing (first phase)
**Requirements**: SCAF-01, SCAF-02, SCAF-03, SCAF-04, SCHE-01, SCHE-02, SCHE-03
**Success Criteria** (what must be TRUE):
  1. `npm install && npm run build` completes with zero errors on Node 22.12+/24 LTS (pinned via `.nvmrc`)
  2. `astro.config.mjs` sets `site`, `base: "/ai-study-note"`, `trailingSlash: "always"`, `build.format: "directory"`, and wires Tailwind 4 through `@tailwindcss/vite`
  3. `src/content.config.ts` defines a `blog` collection whose Zod schema requires `{ title, description, pubDate, category, tags, draft }` and normalizes category/tags with `.toLowerCase().trim()`
  4. Running `astro build` against a deliberately malformed frontmatter file fails loudly with a schema error (no silent defaults)
  5. `quartz/`, `quartz.config.ts`, `quartz.layout.ts`, Quartz scripts in `package.json`, and Quartz-specific `.gitignore` entries no longer exist in the branch
**Plans**: 3 plans
  - [x] 01-PLAN.md — Remove Quartz engine (SCAF-04)
  - [ ] 02-PLAN.md — Astro 6 + Tailwind 4 scaffold (SCAF-01, SCAF-02, SCAF-03)
  - [ ] 03-PLAN.md — Content collection schema with Zod (SCHE-01, SCHE-02, SCHE-03)

### Phase 2: Content Migration
**Goal**: Every existing note lives under `src/content/blog/` with frontmatter that the Phase 1 schema accepts, and no Obsidian-flavored syntax remains.
**Depends on**: Phase 1
**Requirements**: MIGR-01, MIGR-02, MIGR-03, MIGR-04, MIGR-05
**Success Criteria** (what must be TRUE):
  1. All 84 notes from the old `content/` tree are present under `src/content/blog/` with slug-equivalent filenames
  2. Every migrated note's frontmatter validates against the Zod schema (title, description, pubDate, category, tags, draft)
  3. No file in `src/content/blog/` contains Obsidian wikilinks (`[[...]]`) or Smart Columns fences (`:::col`) — all converted to standard Markdown or removed
  4. `npm run build` completes with zero schema validation errors against the full migrated content set
  5. The old top-level `content/` directory has been deleted from the branch
**Plans**: TBD

### Phase 3: Layouts, Routes, and Base-Path Discipline
**Goal**: A reader can browse the full site locally — home, blog index, individual post, category page, tag page, and 404 — with the lean brutalist look and all internal links routed through `import.meta.env.BASE_URL`.
**Depends on**: Phase 2
**Requirements**: LAYO-01, LAYO-02, LAYO-03, LAYO-04, LAYO-05, ROUT-01, ROUT-02, ROUT-03, ROUT-04, ROUT-05, ROUT-06, ROUT-07, BASE-01, BASE-02, BASE-03
**Success Criteria** (what must be TRUE):
  1. Visiting `/` in `npm run dev` renders the home page with working links into the blog
  2. `/blog/` lists every non-draft post; opening any post loads its detail page rendered through `PostLayout` with `prose` Markdown styling
  3. `/categories/<category>/` and `/tags/<tag>/` pages generate for every category and deduped tag found in the collection, each rendering the shared `PostList` card component
  4. `/404` renders the custom not-found page; the visual design (black background, orange accent, monospace-tolerant body) matches `docs/visual-guideline.md`
  5. A grep across `src/` finds zero hardcoded `/blog/`, `/categories/`, `/tags/`, or asset paths — every internal link and static asset URL is constructed from `${import.meta.env.BASE_URL}`
  6. Every `getCollection("blog", ...)` call in the codebase passes `({ data }) => !data.draft`
**Plans**: TBD
**UI hint**: yes

### Phase 4: Deploy Pipeline
**Goal**: A GitHub Actions workflow using the first-party Astro action builds and publishes the site to GitHub Pages on push to `main` and on manual dispatch.
**Depends on**: Phase 3
**Requirements**: DEPL-01, DEPL-02, DEPL-03, DEPL-04
**Success Criteria** (what must be TRUE):
  1. `.github/workflows/deploy.yml` exists and invokes `withastro/action@v6` for build and `actions/deploy-pages@v5` for deploy
  2. The workflow triggers on `push` to `main` and on `workflow_dispatch`
  3. The workflow declares `pages: write` and `id-token: write` permissions plus a `pages` concurrency group
  4. README (or equivalent doc) documents the one-time manual step: Settings → Pages → Source = GitHub Actions
  5. A dry-run or dispatch of the workflow on the migration branch completes the build stage without errors
**Plans**: TBD

### Phase 5: Live Verification and Docs Update
**Goal**: The Astro build replaces Quartz in production — live URL serves the migrated content with CSS intact, local dev is spot-checked, and `CLAUDE.md` reflects the new workflow.
**Depends on**: Phase 4
**Requirements**: DEPL-05, VERI-01, VERI-02, VERI-03, VERI-04
**Success Criteria** (what must be TRUE):
  1. `npm run build` completes locally with zero errors against the final content set
  2. `npm run dev` serves the site locally and spot-checks of home, `/blog/`, a post, a category page, and a tag page all render correctly
  3. After merge to `main`, CI deploys green and `https://wahengchang.github.io/ai-study-note/` serves the migrated content with CSS loading (no base-path 404s in the browser console)
  4. Page count and URL shape on the live site match what Quartz previously emitted for the same content
  5. `CLAUDE.md` no longer references Quartz as the build engine — commands, scope table, and writing rules describe the Astro workflow
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Scaffold and Content Schema | 0/3 | Planned | - |
| 2. Content Migration | 0/TBD | Not started | - |
| 3. Layouts, Routes, and Base-Path Discipline | 0/TBD | Not started | - |
| 4. Deploy Pipeline | 0/TBD | Not started | - |
| 5. Live Verification and Docs Update | 0/TBD | Not started | - |
