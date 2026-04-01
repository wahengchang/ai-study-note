# Formatting Standards

Reusable prompt fragment for Markdown style and structure conventions.

## File Conventions

- **Naming**: All files and folders use `kebab-case`.
- **Location**: Notes go under `content/<topic-hierarchy>/`.
- **Frontmatter**: Every `.md` file must start with YAML frontmatter containing at minimum a `title` field.

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
- No inline HTML unless required for Quartz compatibility.
- No emojis unless the user explicitly requests them.

## Smart Columns

Use `:::col` blocks for side-by-side comparisons only:

```md
:::col
### Before
- old behavior
:::

:::col
### After
- new behavior
:::
```
