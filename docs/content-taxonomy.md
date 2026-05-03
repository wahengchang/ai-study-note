# Content Taxonomy

> Canonical source of truth for `category` and `tag` vocabulary in `src/content/blog/`. The `@content-ops` agent reads this file to classify new notes and audit existing ones.
>
> **If you need a new category or tag that is not in this file, update this file first.** Adding a tag in a note without updating the taxonomy is drift.

## 1. Categories

Every note sets **exactly one** `category` in frontmatter. Approved values:

| Category | Purpose |
|---|---|
| `claude-code` | Claude Code as a product — its CLI, config, plugins, hooks, agent teams, frameworks |
| `openclaw` | OpenClaw agent framework — architecture, FAQs, operational SOPs, skills |
| `prompt-notes` | Prompt engineering research and reusable prompt templates |
| `setup-env` | Environment and development tooling setup |
| `seo-and-geo` | SEO and Generative Engine Optimization strategy |

Normalized to lowercase at load via the Zod schema. Do not invent new values — they require discussion.

## 2. Tag vocabulary

Tags are **closed vocabulary**. Every note includes one Type tag and one or more Subject tags. Tech tags are optional.

### Dimension A — Type (pick exactly one)

What kind of document is this?

| Tag | When to use |
|---|---|
| `guide` | Procedural how-to with steps; reader follows along |
| `reference` | Lookup material — cheat sheets, schemas, chapter-style deep dives |
| `research` | Pure summary of an external source (PDF, article, GitHub repo, video). If the note has a how-to structure, use `guide` instead. |
| `sop` | Formalized standard operating procedure |
| `playbook` | Multi-step strategic framework across time |
| `faq` | Single-question deep dive in question → answer format |
| `template` | Reusable snippet, prompt, or config meant to be copy-pasted |
| `skill-definition` | Packaged skill for an agent runtime (lives under `skills/`, not the blog) |

### Dimension B — Subject (pick one or more)

What is the note about?

| Tag | When to use |
|---|---|
| `claude-code` | Claude Code product, CLI, config, plugins, hooks |
| `openclaw` | OpenClaw framework internals and operations |
| `prompt-engineering` | Prompt design, patterns, prompt frameworks |
| `agent-architecture` | Agent system design — loops, memory, routing (tool-agnostic) |
| `multi-agent` | Multi-agent coordination and team patterns |
| `automation` | Workflow automation, schedulers, cron, task orchestration |
| `devops` | Environment setup, installs, OS/shell configuration |
| `seo` | SEO and Generative Engine Optimization strategy |

### Dimension C — Tech (optional, pick zero or more)

Does the note center on a specific product or technology?

| Tag | When to use |
|---|---|
| `gemini` | Google Gemini |
| `telegram` | Telegram integration |
| `n8n` | n8n workflow automation |
| `tmux` | tmux terminal multiplexer |
| `mcp` | Model Context Protocol |
| `airtable` | Airtable API |
| `minimax` | MiniMax API |

### Banned tags

Must not be introduced. The content-ops agent normalizes them.

| Old tag | Replacement | Reason |
|---|---|---|
| `AI`, `ai` | *(drop)* | Every note is about AI; no signal |
| `prompting` | `prompt-engineering` | Synonym |
| `tutorial` | `guide` | Synonym |
| `Gemini`, `GEMINI` | `gemini` | Casing |
| `HR`, `SEO`, `GEO` | lowercase / drop | Casing; category already encodes role |
| `數位行銷` | `seo` or drop | Chinese one-off; not in vocabulary |
| `harness-framework`, `agent` | `agent-architecture` | Consolidate |
| `tools` | *(drop)* | Not discriminating |
| `context-window`, `memory` | `agent-architecture` | Sub-aspect |
| `workspace` | `openclaw` | OpenClaw-specific concept |
| `routing` | `multi-agent` | Sub-aspect |

## 3. Frontmatter schema

Every note in `src/content/blog/` requires this frontmatter (validated by `src/content.config.ts`):

```yaml
---
title: "Note Title"                     # required, zh-tw / English / mixed all OK
description: "一行摘要"                  # required, zh-tw, ≤160 chars (~80 zh-tw chars)
pubDate: 2026-04-21                     # required, YYYY-MM-DD
category: claude-code                   # required, one of the values in §1
tags:                                   # optional, YAML list format (not inline)
  - <type>                              # exactly one from Dimension A
  - <subject>                           # one or more from Dimension B
  - <tech>                              # optional, zero or more from Dimension C
people:                                 # optional, slugs from src/data/people.ts
  - <person-slug>                       # zero or more; build fails on unknown slug
draft: false                            # optional, default false
---
```

### Rules

- Use YAML list format (`- item`), not inline (`[a, b]`).
- Indent with exactly 2 spaces.
- Tags are lowercase kebab-case, no quotes — schema normalizes automatically.
- **Audience: 繁體中文 (zh-tw) readers.** Body and `description` are written in zh-tw. Technical terminology (library names, API names, command flags, code identifiers) stays in English. Bilingual form `代理 (agent)` is acceptable. `title` can be zh-tw / English / mixed. See `CLAUDE.md` §Language.
- `skill.md` files under `skills/` are **not** blog content and do not follow this schema.

### `people:` is a separate top-level concept (not a 4th tag dimension)

The `people:` field attributes a note to one or more **notable figures** whose ideas the note builds on (Pocock, Harry Dry, Dan Koe, etc.). It is **not** a tag dimension — keep the Type / Subject / Tech taxonomy clean.

- Slugs are full-name kebab-case (`matt-pocock`, `harry-dry`).
- The closed registry lives at `src/data/people.ts` (display name, zh-tw bio, canonical links). Build fails on unknown slugs via `z.enum`.
- Each person gets an auto-generated `/people/<slug>/` page with bio, links, and the list of notes that reference them.
- Notes display attributed people as a "via" chip footer.
- Add a new person by appending a record to the registry; do not invent slugs in note frontmatter.

## 4. Naming rules

- Filename = URL slug. Use `kebab-case.md`, no spaces, no underscores, no capitals.
- Max 60 chars in filename (including `.md`).
- Prefix chapter series with `ch<N>-` (e.g., `ch1-architecture-four-pillars.md`).
- Prefix setup guides with `setup-` (e.g., `setup-nodejs-macbook.md`).

## 5. Change control

Updating this taxonomy is a deliberate act:

- Add a new category → update §1 in its own commit; audit existing notes afterward.
- Add a new tag → update §2 in its own commit; `@content-ops` audit is run after.
- Retire a tag → add it to "Banned tags" with a replacement; run migration audit.
