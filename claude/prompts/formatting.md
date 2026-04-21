# Formatting Standards

Reusable prompt fragment for Markdown style and structure conventions.

## File Conventions

- **Naming**: All files use `kebab-case.md`. Filename = URL slug.
- **Location**: Notes live under `src/content/blog/` (flat layout).
- **Frontmatter**: Every note must validate against the Zod schema in `src/content.config.ts` — required fields: `title`, `description`, `pubDate`, `category`. Optional: `tags`, `draft`.

## Writing Style

- Lead with the actionable insight. No introductions, no conclusions.
- Use bullet points for lists of facts, steps, or options.
- Use tables for comparative data or parameter references.
- Use headings (`##`, `###`) to create scannable structure.
- Code blocks must be copy-pasteable — include language identifiers.
- Use precise domain terminology. Avoid vague terms:
  - "p99 latency" not "slow"
  - "idempotent" not "safe to retry"
  - "409 Conflict" not "error"

## Prohibited Patterns

- No conversational filler ("Let's dive in", "In this article").
- No redundant summaries at the end.
- No inline HTML unless strictly needed — `prose` styling handles Markdown elements.
- No emojis unless the user explicitly requests them.
- **No Obsidian wikilinks** (`[[...]]`, `![[...]]`) — use standard Markdown links.
- **No Smart Columns** (`:::col`) — removed during the Astro migration.

## Linking

- Internal: `[text](/ai-study-note/blog/<slug>/)` — absolute base-prefixed path.
- Images: `![alt](/ai-study-note/assets/<filename>)` — files live in `public/assets/`.
- External: standard Markdown.
