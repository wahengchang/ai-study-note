# AI Study Note — Claude Code Configuration

## Project Overview

A Quartz-powered digital garden for AI learning notes. Content is authored in Obsidian-flavored Markdown, built with Quartz v4, and deployed to GitHub Pages.

- **Live site**: https://wahengchang.github.io/ai-study-note/
- **Engine**: Quartz (Preact + esbuild)
- **Node**: >=22, npm >=10.9.2

## Scope

| Directory | Purpose |
|-----------|---------|
| `content/` | Main notes — primary authoring area |
| `docs/` | Project docs (style guide, syntax reference) |
| `quartz/` | Quartz engine, components, plugins |
| `skills/` | OpenAI-compatible skill definitions |
| `claude/` | Modular prompt system (agents, prompts, config) |

## Core Commands

```bash
npm run quartz -- build          # Build site
npm run quartz -- build --serve  # Build + local preview (port 8080)
npm run check                    # Typecheck + formatting
npm run format                   # Prettier formatting
npm run clean                    # Remove macOS ._* files
```

## Writing Rules

1. **File naming**: `kebab-case` for all notes and folders.
2. **Frontmatter**: Every note requires a `title` field.
3. **Syntax**: Standard Markdown + Obsidian wikilinks + Smart Columns (`:::col`).
4. **Style**: Bullet points, copy-pasteable code blocks, direct headings. No fluff.
5. **Mermaid**: Use `direction LR` only. Never `TD`. Include only when visualization adds clarity.
6. **Terminology**: Use precise domain terms (e.g., "p99 latency" not "slow").

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
│   ├── mermaid.md       — Diagram rules and templates
│   └── quartz.md        — Quartz-specific syntax and config
└── config.yaml      # Agent registry and defaults
```

### How It Works

- **Agents** are self-contained roles that compose one or more **prompt fragments**.
- **Prompt fragments** encapsulate a single concern (formatting, diagrams, Quartz conventions) and are referenced by agents that need them.
- **config.yaml** registers all agents and sets project-wide defaults.

### Usage

Reference agents by name when delegating tasks:

- `@writer` — Convert experiments into lean, decision-ready notes.
- `@reviewer` — Audit a note for accuracy, style, and completeness.
- `@diagram` — Generate or refactor Mermaid diagrams.
- `@content-ops` — Reorganize files, fix frontmatter, bulk updates.

## Design Tokens (Quick Reference)

| Token | Value | Usage |
|-------|-------|-------|
| bg-global | `#050505` | Page background |
| brand-orange | `#FF4F00` | Accent, links, alerts |
| text-primary | `#E5E5E5` | Body text |
| text-muted | `#737373` | Metadata, footnotes |
| border-default | `#333333` | Dividers, outlines |

## Config Files

- `quartz.config.ts` — Site config, plugins, theme.
- `quartz.layout.ts` — Page layout and sidebar components.
- `docs/visual-guideline.md` — Full design token reference.
- `docs/custom-syntax.md` — Smart Columns and extended syntax.

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

Technology stack not yet documented. Will populate after codebase mapping or first phase.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
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
