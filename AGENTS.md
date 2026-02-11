# Project Essentials

## Scope
- `content/`: Main notes (primary authoring area).
- `docs/`: Project docs (plan, style guide, references).
- `quartz/`: Quartz engine and components.
- `public/`: Build output (regenerated).

## Core Commands
- `npm run quartz -- build`: Build site.
- `npm run quartz -- build --serve`: Build + local preview.
- `npm run docs`: Serve `docs/` as a Quartz site.
- `npm run clean`: Remove macOS `._*` files.
- `npm run check`: Typecheck + formatting check.

## Writing Rules
- Note and folder names: `kebab-case`.
- Put clear `title` in frontmatter for each note.
- This project supports column syntax via Quartz Smart Columns, plus normal Markdown/Obsidian Markdown syntax.

## Skills
- `writer`: Turn hands-on experiments and troubleshooting into lean Quartz notes with clear structure, precise terminology, Smart Columns, and Mermaid when useful.
- Skill file: `skills/writer/SKILL.md`.
- Skill agent config: `skills/writer/agents/openai.yaml`.
- `simple-draw`: Create compact, readable Mermaid diagrams for Quartz notes with LR-first layouts and high-contrast styling.
- Skill file: `skills/simple-draw/SKILL.md`.

## Config
- Main config files: `quartz.config.ts`, `quartz.layout.ts`.
- Visual guideline: `docs/visual-guideline.md`.
- Node `>=22`, npm `>=10.9.2`.
