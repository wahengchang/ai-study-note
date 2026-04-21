# AI Study Note — Claude Code Configuration

## Project Overview

An Astro-powered digital garden for AI learning notes. Content is authored in standard Markdown with frontmatter, built with Astro 6, and deployed to GitHub Pages.

- **Live site**: https://wahengchang.github.io/ai-study-note/
- **Engine**: Astro 6 + Tailwind 4 (via `@tailwindcss/vite`) + `@tailwindcss/typography`
- **Node**: 22.12+ or 24 LTS (pinned via `.nvmrc`)

## Scope

| Directory | Purpose |
|-----------|---------|
| `src/content/blog/` | Main notes — primary authoring area (flat layout, kebab-case filenames) |
| `src/content.config.ts` | Zod schema for the `blog` collection |
| `src/layouts/` | `BaseLayout.astro`, `PostLayout.astro` |
| `src/components/` | `Header.astro`, `Footer.astro`, `PostList.astro` |
| `src/pages/` | Routes: `index`, `404`, `blog/`, `categories/`, `tags/` |
| `src/styles/global.css` | Tailwind imports + `@theme` design tokens |
| `public/assets/` | Images referenced from notes |
| `docs/` | Project docs (`visual-guideline.md`) |
| `scripts/` | `migrate-content.mjs` — historical migration script |
| `claude/` | Modular prompt system (agents, prompts, config) |

## Core Commands

```bash
npm run dev       # Local dev server at http://localhost:4321/ai-study-note/
npm run build     # Static build to dist/
npm run preview   # Preview the built site
```

## Writing Rules

1. **File naming**: `kebab-case` for all notes (filename = URL slug).
2. **Frontmatter (required)**: `title`, `description`, `pubDate`, `category`, `tags`, `draft`.
   - `category` / `tags` are normalized to lowercase at schema load — don't worry about casing in files.
   - `draft: true` excludes a note from the live site.
3. **Syntax**: Standard Markdown only. **No Obsidian wikilinks** (`[[...]]`) or Smart Columns (`:::col`) — they were stripped during the Astro migration.
4. **Images**: Put files under `public/assets/` and reference with absolute base-prefixed paths, e.g. `![](/ai-study-note/assets/foo.png)`.
5. **Internal links in code/components**: Always use `${import.meta.env.BASE_URL}...`. Never hardcode `/blog/`, `/categories/`, `/tags/`, or asset paths.
6. **Draft filter**: Every `getCollection("blog", ...)` call must pass `({ data }) => !data.draft`. No exceptions.
7. **Style**: Bullet points, copy-pasteable code blocks, direct headings. No fluff.
8. **Mermaid**: Use `direction LR` only. Never `TD`. Include only when visualization adds clarity.
9. **Terminology**: Use precise domain terms (e.g., "p99 latency" not "slow").

## Adding a Note

1. Create `src/content/blog/<slug>.md` with the 6 required frontmatter fields.
2. Save. Dev server hot-reloads. It appears on home (if recent), blog index, its category page, and its tag pages.

## Prompt System

This project uses a modular prompt system under `claude/`:

```
claude/
├── agents/          # Task-specific agent configs
│   ├── writer.md        — Technical note authoring
│   ├── reviewer.md      — Content quality review
│   ├── diagram.md       — Mermaid diagram generation
│   └── content-ops.md   — File organization and maintenance
├── prompts/         # Reusable prompt fragments
│   ├── formatting.md    — Markdown and style conventions
│   └── mermaid.md       — Diagram rules and templates
└── config.yaml      # Agent registry and defaults
```

Reference agents by name when delegating tasks:

- `@writer` — Convert experiments into lean, decision-ready notes.
- `@reviewer` — Audit a note for accuracy, style, and completeness.
- `@diagram` — Generate or refactor Mermaid diagrams.
- `@content-ops` — Reorganize files, fix frontmatter, bulk updates.

## Design Tokens (Quick Reference)

| Token | Value | Usage |
|-------|-------|-------|
| bg-global | `#050505` | Page background |
| bg-card | `#000000` | Card/container fill |
| brand-orange | `#FF4F00` | Accent, links, hover, focus |
| text-primary | `#E5E5E5` | Body text |
| text-muted | `#737373` | Metadata, footnotes |
| border-default | `#333333` | 1px dividers, card outlines |
| border-active | `#FF4F00` | Active/focus states |

Exposed as Tailwind classes via `@theme` in `src/styles/global.css`. Full spec: `docs/visual-guideline.md`.

## Config Files

- `astro.config.mjs` — Site + base path (`/ai-study-note`), trailing slash, Tailwind Vite plugin.
- `src/content.config.ts` — Zod schema for the `blog` collection.
- `tsconfig.json` — Extends `astro/tsconfigs/strict`.
- `docs/visual-guideline.md` — Full design token reference.

## Deployment

CI auto-deploys on push to `main` via `.github/workflows/deploy.yml` (`withastro/action@v6` → `actions/deploy-pages@v5`).

**One-time manual step:** GitHub → Settings → Pages → Source = **GitHub Actions**.

<!-- GSD:project-start source:PROJECT.md -->
## Project

**AI Study Note — Astro Migration**

A personal digital garden of AI study notes, published at https://wahengchang.github.io/ai-study-note/. Content is authored in Markdown, built to a static site, and deployed to GitHub Pages. This milestone replaces the current Quartz v4 engine with Astro 6.x while preserving all existing content.

**Core Value:** Every existing note remains readable at its equivalent URL on the live site after the framework swap. The site builds, deploys, and renders correctly on GitHub Pages — if that fails, nothing else matters.

### Constraints

- **Framework**: Astro 6.x — dropped Node 18/20; requires Node 22.12+ or 24 LTS.
- **Styling**: Tailwind 4 via `@tailwindcss/vite` — `@astrojs/tailwind` is deprecated; do not use.
- **Typography**: `@tailwindcss/typography` for `prose` on rendered Markdown bodies.
- **Content schema**: Zod-validated; `category`/`tags` normalized with `.toLowerCase().trim()` to prevent route collisions.
- **URL shape**: `trailingSlash: "always"` + `build.format: "directory"` to match GitHub Pages static serving.
- **Base path**: `/ai-study-note` — every internal link routes through `import.meta.env.BASE_URL`.
- **Draft filter**: Every `getCollection("blog", ...)` call must pass `({ data }) => !data.draft`. No exceptions.
- **Deploy**: `withastro/action@v6` → `actions/deploy-pages@v5` via GitHub Actions; manual one-time step: Settings → Pages → Source = GitHub Actions.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:STACK.md -->
## Technology Stack

- **Framework:** Astro 6.x (static-first, zero JS by default, Content Collections)
- **Styling:** Tailwind 4 via `@tailwindcss/vite` (CSS-first `@theme` config)
- **Typography:** `@tailwindcss/typography` (`prose` class on rendered Markdown)
- **Content:** Content Layer API — `glob()` loader + Zod schema
- **Runtime:** Node 22.12+ / 24 LTS
- **Deploy:** `withastro/action@v6` → `actions/deploy-pages@v5` (GitHub Pages)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

- Filename = URL slug (kebab-case).
- Every `getCollection("blog", ...)` filters drafts.
- All internal links use `${import.meta.env.BASE_URL}...`; no hardcoded paths.
- Images live in `public/assets/`; reference with absolute base-prefixed URLs.
- Shared card rendering is in `PostList.astro` — don't duplicate across pages.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

```
BaseLayout (head + Header + Footer + slot)
  └── PostLayout (post meta + prose slot)
        └── rendered Markdown

src/pages/
├── index.astro              → /
├── 404.astro                → /404
├── blog/index.astro         → /blog/
├── blog/[...slug].astro     → /blog/<post>/
├── categories/[category].astro  → /categories/<name>/
└── tags/[tag].astro         → /tags/<tag>/
```

Dynamic routes use `getStaticPaths()` + `render(post)` from `astro:content`. Taxonomy routes dedupe with `new Set(posts.flatMap(...))`.
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
