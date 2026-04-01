# Quartz Conventions

Reusable prompt fragment for Quartz-specific syntax, config, and build rules.

## Content Structure

```
content/
├── claude-code/              # Claude Code ecosystem
│   └── tools-and-skills/     # Plugins, hooks, channels, frameworks
├── openclaw/                 # OpenClaw agent framework (ch1–ch7)
│   ├── common-questions/     # FAQ-style deep dives
│   ├── instruction-notes/    # SOPs and operational guides
│   └── skill-notes/          # Skill definitions with references
├── gemini-prompts/           # Google Gemini prompt templates
├── research-notes/           # Study notes from external sources (YouTube, articles, repos)
├── seo-and-geo/              # SEO & GEO strategy
├── setup-env/                # Development environment setup
└── index.md                  # Landing page
```

## Frontmatter

Required fields:

```yaml
---
title: "Note Title"
---
```

Recommended fields:

```yaml
description: "One-line summary (≤160 chars)"
tags:
  - platform-tag    # claude-code | openclaw | gemini | google-workspace
  - topic-tag       # agent-architecture | automation | devops | ...
  - type-tag        # guide | reference | tutorial | playbook | sop | template
```

Optional fields: `date`, `aliases`, `draft`.

Full tag taxonomy and frontmatter rules: `docs/system-rules.md`.

## Supported Syntax

| Feature | Syntax | Notes |
|---------|--------|-------|
| Wikilinks | `[[note-name]]` | Obsidian-style internal links |
| Callouts | `> [!info]` | Obsidian callout blocks |
| Smart Columns | `:::col ... :::` | Side-by-side layout |
| Math | `$...$` or `$$...$$` | KaTeX rendering |
| Mermaid | ` ```mermaid ` | See mermaid.md for rules |
| Code blocks | ` ```lang ` | Shiki syntax highlighting |

## Build & Verify

After creating or editing content, verify with:

```bash
npm run quartz -- build          # Must exit 0
npm run check                    # Typecheck + format check
```

For local preview:

```bash
npm run quartz -- build --serve  # http://localhost:8080/ai-study-note/
```

## Config Files

- `quartz.config.ts` — Site title, base URL, analytics, plugins, theme colors.
- `quartz.layout.ts` — Page layout: header, sidebars (search, explorer, TOC, backlinks, graph).
- Plugins of note: FrontMatter, ObsidianFlavoredMarkdown, SmartColumns, SyntaxHighlighting, OGImage.
