# Phase 1: Scaffold and Content Schema - Context

**Gathered:** 2026-04-21
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Astro 6 builds a working shell on the `feat/astro-migration` branch with a type-safe `blog` collection definition; the Quartz engine is removed from the tree.

Covers:
- Astro 6.x project initialization (package.json, tsconfig, astro.config.mjs)
- Node version pinning via `.nvmrc`
- Tailwind 4 via `@tailwindcss/vite` and `@tailwindcss/typography` plugin
- `src/content.config.ts` at `src/` root with Zod schema for `blog` collection
- Removal of `quartz/`, `quartz.config.ts`, `quartz.layout.ts`, Quartz scripts, Quartz gitignore entries
- Baseline `src/styles/global.css` with `@import "tailwindcss";` and `@plugin "@tailwindcss/typography";`

Does NOT cover:
- Layouts, components, pages (Phase 3)
- Content migration (Phase 2)
- Deploy pipeline (Phase 4)

</domain>

<decisions>
## Implementation Decisions

### Non-Negotiable (from PROJECT.md)
- Framework: Astro 6.x
- Styling: Tailwind 4 via `@tailwindcss/vite` — `@astrojs/tailwind` is deprecated
- Typography: `@tailwindcss/typography`
- Node: pin 22.12+ or 24 LTS via `.nvmrc`
- `astro.config.mjs`: `site: "https://wahengchang.github.io"`, `base: "/ai-study-note"`, `trailingSlash: "always"`, `build.format: "directory"`, `vite.plugins: [tailwindcss()]`
- `src/content.config.ts` at `src/` ROOT (not `src/content/`)
- Zod schema: `{ title, description, pubDate: z.coerce.date(), category: z.string().toLowerCase().trim(), tags: z.array(z.string().toLowerCase().trim()).default([]), draft: z.boolean().default(false) }`
- Schema must fail build on malformed frontmatter (no silent defaults for required fields)

### Claude's Discretion
All remaining implementation choices are at Claude's discretion — use current Astro 6 / Tailwind 4 idioms and minimal boilerplate.

- `package.json` scripts shape (standard Astro: dev/build/preview + format/typecheck if useful)
- Whether to keep a sample `src/content/blog/hello-astro.md` seed note for build validation (recommended — remove in Phase 2)
- `tsconfig.json` shape (extend `astro/tsconfigs/strict`)
- Exact Tailwind plugin pragmas in `global.css`
- Whether Prettier remains (optional)

</decisions>

<code_context>
## Existing Code Insights

### To Remove
- `quartz/` — entire engine directory
- `quartz.config.ts`, `quartz.layout.ts` — Quartz config
- `package.json` — strip Quartz deps and scripts (`quartz`, `check`, `format` if Quartz-specific, `clean`), add Astro equivalents
- `.gitignore` entries: `public/`, `.quartz/`, `.quartz-cache/` are no longer needed (Astro emits to `dist/`)
- `tsconfig.json` — currently Quartz-shaped, replace with Astro's strict preset

### To Preserve
- `content/` directory — leave untouched in Phase 1; migrated in Phase 2
- `docs/`, `claude/`, `skills/`, `CLAUDE.md`, `README.md`
- `.planning/`, `.gitignore` (minus Quartz lines), `.nvmrc` (create if missing)

### Integration Points
- `src/content.config.ts` is the single source of truth for post frontmatter shape — Phase 2's migration script must conform to it.

</code_context>

<specifics>
## Specific Ideas

- Keep `package.json` scripts minimal: `dev`, `build`, `preview`, plus `astro` for CLI passthrough.
- `.nvmrc` contents: `22` (Node 22 LTS — simplest, matches `>=22.12`).
- `global.css` contents:
  ```
  @import "tailwindcss";
  @plugin "@tailwindcss/typography";
  ```
- Leave a single seed note `src/content/blog/_scaffold-check.md` (draft: true) to exercise the schema end-to-end during Phase 1 verification. Phase 2 will replace it with real content and remove this file.

</specifics>

<deferred>
## Deferred Ideas

- RSS, sitemap, OG image generation — v2.
- `@astrojs/check` integration — Phase 5 docs update if desired.
- Prettier/ESLint config reshape — leave as-is unless it blocks the build.

</deferred>
