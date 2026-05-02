# Development & Operations

Project architecture, build commands, deployment, and configuration files. For content authoring rules, see `docs/system-rules.md`. For taxonomy, see `docs/content-taxonomy.md`.

## Architecture

```
BaseLayout (head + Header + Footer + slot)
  └── PostLayout (post meta + prose slot)
        └── rendered Markdown

src/pages/
├── index.astro                       → /
├── 404.astro                         → /404
├── blog/index.astro                  → /blog/
├── blog/[...slug].astro              → /blog/<post>/
├── categories/[category].astro       → /categories/<name>/
└── tags/[tag].astro                  → /tags/<tag>/
```

Dynamic routes use `getStaticPaths()` + `render(post)` from `astro:content`. Taxonomy routes dedupe with `new Set(posts.flatMap(...))`. Shared card rendering is in `PostList.astro` — don't duplicate across pages.

## Content collections

One collection is defined in `src/content.config.ts`:

| Collection | Path | Schema | Renders to live routes? |
|---|---|---|---|
| `blog` | `src/content/blog/` | Strict — all 6 fields required, `category` locked via `z.enum(CATEGORIES)` | Yes (entries with `draft: true` are filtered out by every `getCollection` call) |

Use `draft: true` on a post's frontmatter to keep it out of the build while iterating in place. The `@aihero-writer` workflow writes finished posts straight to `src/content/blog/`; see `.claude/agents/aihero-writer.md`.

## Commands

```bash
npm run dev       # Local dev server at http://localhost:4321/ai-study-note/
npm run build     # Static build to dist/ — exits 0 = green
npm run preview   # Preview the built site
```

Requires Node 22.12+ or 24 LTS (pinned via `.nvmrc`).

## Config files

| File | Purpose |
|---|---|
| `astro.config.mjs` | Site + base path (`/ai-study-note`), `trailingSlash: "always"`, Tailwind Vite plugin |
| `src/content.config.ts` | Zod schema for `blog`; exports `CATEGORIES` enum |
| `tsconfig.json` | Extends `astro/tsconfigs/strict` |
| `.gitignore` | `node_modules/`, `dist/`, `.astro/`, `.research/` (writer-workflow sidecars), `.planning/` |

## Build invariants

- **URL shape**: `trailingSlash: "always"` + `build.format: "directory"` to match GitHub Pages static serving.
- **Base path**: `/ai-study-note` — every internal link routes through `import.meta.env.BASE_URL`.
- **Framework**: Astro 6.x — Node 18/20 dropped.
- **Styling**: Tailwind 4 via `@tailwindcss/vite`. Do not use the deprecated `@astrojs/tailwind`.
- **Typography**: `@tailwindcss/typography` for `prose` on rendered Markdown bodies.
- **Schema**: Zod-validated; `category`/`tags` normalized to lowercase to prevent route collisions; `category` locked via `z.enum(CATEGORIES)`.

## Deployment

CI auto-deploys on push to `main` via `.github/workflows/deploy.yml`:

- `withastro/action@v6` → `actions/deploy-pages@v5`

**One-time manual step (cannot be automated):** GitHub → Settings → Pages → Source = **GitHub Actions**.

## See also

- `CLAUDE.md` — Writing workflow + safety invariants
- `docs/content-taxonomy.md` — Closed vocabulary for category/tags
- `docs/system-rules.md` — Full content governance rules
- `docs/visual-guideline.md` — Design tokens, typography, layout
