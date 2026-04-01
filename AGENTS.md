# Project Essentials

## Scope
- `content/`: Main notes (primary authoring area).
- `docs/`: Project docs (plan, style guide, references).
- `quartz/`: Quartz engine and components.
- `claude/`: Modular prompt system (agents, prompts, config).
- `skills/`: OpenAI-compatible skill definitions.
- `public/`: Build output (regenerated).

## Core Commands
- `npm run quartz -- build`: Build site.
- `npm run quartz -- build --serve`: Build + local preview.
- `npm run clean`: Remove macOS `._*` files.
- `npm run check`: Typecheck + formatting check.

## Writing Rules
- Note and folder names: `kebab-case`.
- Put clear `title` in frontmatter for each note.
- This project supports column syntax via Quartz Smart Columns, plus normal Markdown/Obsidian Markdown syntax.
- Mermaid diagrams: `direction LR` only. See `claude/prompts/mermaid.md`.

## Prompt System
- **Config**: `CLAUDE.md` (core rules), `claude/config.yaml` (agent registry).
- **Agents** (task-specific roles under `claude/agents/`):
  - `writer` — Technical note authoring with evidence-based structure.
  - `reviewer` — Content quality audit across structure, accuracy, style.
  - `diagram` — Mermaid diagram generation and refactoring.
  - `content-ops` — File organization, frontmatter fixes, bulk maintenance.
- **Prompt fragments** (reusable modules under `claude/prompts/`):
  - `formatting.md` — Markdown style and conventions.
  - `mermaid.md` — Diagram rules and templates.
  - `quartz.md` — Quartz-specific syntax and config.

## Skills (OpenAI-Compatible)
- `writer`: Skill file `skills/writer/SKILL.md`, agent config `skills/writer/agents/openai.yaml`.
- `simple-draw`: Skill file `skills/simple-draw/SKILL.md`.

## Config
- Main config files: `quartz.config.ts`, `quartz.layout.ts`.
- Visual guideline: `docs/visual-guideline.md`.
- Node `>=22`, npm `>=10.9.2`.
