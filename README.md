# Mr.Chang AI Practice Notebook

Practical AI notes built on Astro 6.

Site: https://wahengchang.github.io/ai-study-note/

## Project Structure

- `src/content/blog/`: published AI notes (Markdown with frontmatter). Use `draft: true` in frontmatter to keep a post out of the build while iterating.
- `src/content.config.ts`: Zod schema for the `blog` collection; exports `CATEGORIES` enum.
- `src/layouts/`, `src/components/`, `src/pages/`: layouts, components, routes.
- `src/styles/global.css`: Tailwind 4 imports + `@theme` tokens.
- `public/assets/`: images referenced from notes.
- `docs/`: canonical guidelines — `content-taxonomy.md`, `system-rules.md`, `dev.md`, `visual-guideline.md`.
- `.claude/`: Claude Code project — agents (`@aihero-writer`, `@categorizer`, `@diagram`, `@content-ops`), skills, prompts.

## Commands

- `npm run dev`: local dev server at `http://localhost:4321/ai-study-note/`.
- `npm run build`: static build to `dist/`.
- `npm run preview`: preview the built site.

Requires Node 22.12+ or 24 LTS (pinned via `.nvmrc`).

## Writing Conventions

- Use `kebab-case` for note filenames.
- Required frontmatter: `title`, `description`, `pubDate`, `category`, `tags`, `draft`.
- `category` and `tags` are normalized to lowercase at schema load.
- Standard Markdown. No Obsidian wikilinks or Smart Columns — use absolute base-prefixed paths for images (`/ai-study-note/assets/foo.png`).

## Deployment

CI auto-deploys on push to `main` via `.github/workflows/deploy.yml` (`withastro/action@v6` → `actions/deploy-pages@v5`).

**One-time manual step:** In GitHub → Settings → Pages, set **Source** to **GitHub Actions**. This cannot be automated.

## References

- Live site: https://wahengchang.github.io/ai-study-note/
- Astro docs: https://docs.astro.build/
- Writing workflow + safety invariants: `CLAUDE.md`
- Full content rules: `docs/system-rules.md`
- Closed-vocabulary taxonomy: `docs/content-taxonomy.md`
