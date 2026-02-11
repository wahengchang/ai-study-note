# Mr.Chang AI Practice Notebook

Practical AI notes built on Quartz.

Site: https://wahengchang.github.io/ai-study-note/

## Project Structure

- `content/`: main AI notes.
- `docs/`: project docs (`custom-syntax.md`, `visual-guideline.md`).
- `quartz/`: Quartz engine and components.
- `public/`: generated build output.

## Commands

- `npm run quartz -- build`: build site.
- `npm run dev`: build + local preview with GitHub Pages base path.
- `npm run dev:root`: build + local preview at root path (no base path).
- `npm run docs`: preview docs folder as site.
- `npm run clean`: remove macOS `._*` files.

Local preview URL (recommended): `http://localhost:8080/ai-study-note/`

## Writing Conventions

- Use `kebab-case` for note and folder names.
- Add `title` in frontmatter for each note.
- Custom syntax support: Smart Columns (`:::col ... :::`) plus standard Markdown/Obsidian syntax.

## References

- Live site: https://wahengchang.github.io/ai-study-note/
- Quartz docs: https://quartz.jzhao.xyz/
