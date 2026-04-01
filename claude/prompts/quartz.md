# Quartz Conventions

Reusable prompt fragment for Quartz-specific syntax, config, and build rules.

## Content Structure

```
content/
├── Claude/              # Claude API and tools
├── OpenClaw/            # Main tutorial series (ch1–ch7)
│   ├── common-questions/
│   ├── instruction-notes/
│   └── skill-notes/
├── SEO&GEO/             # Search and geo optimization
├── SetupEnv/            # Environment setup
├── gemini-prompts/      # Google Gemini examples
└── index.md             # Landing page
```

## Frontmatter

Required fields:

```yaml
---
title: Your Note Title
---
```

Optional fields supported by Quartz plugins: `date`, `tags`, `description`, `draft`.

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
