# Mr.Chang AI Practice Notebook

Practical AI notes built on Astro 6.

Site: https://wahengchang.github.io/ai-study-note/

## Project Structure

- `src/content/blog/`: main AI notes (Markdown with frontmatter).
- `src/content.config.ts`: Zod schema for the `blog` collection.
- `src/layouts/`, `src/components/`, `src/pages/`: layouts, components, routes.
- `src/styles/global.css`: Tailwind 4 imports + `@theme` tokens.
- `public/assets/`: images referenced from notes.
- `docs/`: project docs (`custom-syntax.md`, `visual-guideline.md`).

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
