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
