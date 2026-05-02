---
title: "System Rules — Content Governance for AI Study Note"
---

# System Rules — Content Governance

Definitive rules for Markdown formatting, frontmatter schema, tagging taxonomy, and linking protocols. Claude Code agents must follow these rules when authoring, reviewing, or reorganizing content.

---

## 1. File & Folder Naming

| Rule | Example |
|------|---------|
| All folders use `kebab-case` | `claude-code/`, `setup-env/`, `seo-and-geo/` |
| All `.md` files use `kebab-case` | `agent-teams-guide.md`, `ch1-architecture-four-pillars.md` |
| No spaces, PascalCase, camelCase, or special characters (`&`, `+`) in paths | ~~`Tools&Skills/`~~ → `tools-and-skills/` |
| Skill definition files use `skill.md` (lowercase) | `skill-notes/airtable-api/skill.md` |
| Index files use `index.md` | `openclaw/index.md` |

---

## 2. Frontmatter Schema

Every `.md` file in `src/content/blog/` **must** have YAML frontmatter matching the Zod schema in `src/content.config.ts`. Builds fail on missing required fields.

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | `string` | Display title — zh-tw / English / mixed all OK. Use quotes if it contains colons or special chars. |
| `description` | `string` | One-line summary in zh-tw (≤160 chars; ~80 zh-tw chars fits since Chinese is denser). Used for SEO meta and card lists. |
| `pubDate` | `YYYY-MM-DD` | Publication date. Parsed via `z.coerce.date()`. |
| `category` | `string` | Single category. Normalized to lowercase at load. |

### Optional Fields (with defaults)

| Field | Type | Description |
|-------|------|-------------|
| `tags` | `string[]` | Lateral associations from the controlled taxonomy (see §3). Defaults to `[]`. Normalized to lowercase. |
| `draft` | `boolean` | Set `true` to exclude from build — every `getCollection("blog", …)` call filters `!data.draft`. Defaults to `false`. |

### Frontmatter Template

```yaml
---
title: "Note Title Here"
description: "One-line summary of the note"
tags:
  - platform-tag
  - topic-tag
  - type-tag
aliases:
  - alternative/path
---
```

### Skill Definition Frontmatter

Skill files (`skill.md`) use OpenAI-compatible schema with additional fields:

```yaml
---
name: skill-name
description: "What the skill does and when to use it"
tags:
  - openclaw
  - skill-definition
metadata:
  openclaw:
    emoji: "🔧"
    requires:
      bins: [curl]
      env: [API_KEY]
---
```

---

## 3. Tag Taxonomy (Controlled Vocabulary)

Tags are **lateral associations** that cross-cut the folder hierarchy and drive `/tags/<tag>/` page generation via `src/pages/tags/[tag].astro`.

**The authoritative tag vocabulary lives in [`docs/content-taxonomy.md`](content-taxonomy.md) §2.** Every tag must come from that closed vocabulary; agents that encounter an unlisted tag must stop and ask, or update the taxonomy first in its own commit.

### Tagging Rules

1. Every note has **exactly one Type tag** (taxonomy §2 Dimension A) and **at least one Subject tag** (Dimension B). Tech tags (Dimension C) are optional.
2. Use **lowercase-kebab-case** for all tags. No capitals, no spaces.
3. Do not invent new tags without updating `docs/content-taxonomy.md` first in a separate commit.
4. Tags drive `/tags/<tag>/` page generation — each tag gets its own page via `src/pages/tags/[tag].astro`.

---

## 4. Categories (Flat Layout)

After the Astro migration, `src/content/blog/` uses a **flat directory**: every note lives at `src/content/blog/<slug>.md`. Categorization is expressed via the `category` frontmatter field, not the folder tree.

**The authoritative category list lives in [`docs/content-taxonomy.md`](content-taxonomy.md) §1.**

### Rules

1. Every note sets exactly one `category` in frontmatter. The value must match one of the approved slugs in `docs/content-taxonomy.md` §1 (lowercase-kebab-case).
2. Category pages are generated automatically at `/categories/<name>/` by `src/pages/categories/[category].astro`.
3. New categories require approval — do not introduce new values without discussion, and update `docs/content-taxonomy.md` §1 first in a separate commit.

---

## 5. Linking Protocols

Obsidian wikilinks (`[[...]]`, `![[...]]`) and Smart Columns (`:::col`) were stripped during the Astro migration. Use **standard Markdown only**.

### Internal links

Use relative Markdown links that mirror the built URL shape. Since every note builds to `/ai-study-note/blog/<slug>/`, link by slug:

```markdown
[Display text](/ai-study-note/blog/other-note-slug/)
```

### Images

Assets live in `public/assets/`. Reference them with absolute base-prefixed URLs:

```markdown
![Alt text](/ai-study-note/assets/diagram.png)
```

### External links

Standard Markdown: `[text](https://example.com)`.

### Backlinks (Related Section)

Every note with clear semantic connections should include a `## Related` section at the bottom:

```markdown
## Related

- [Display Text](/ai-study-note/blog/related-note-1/)
- [Display Text](/ai-study-note/blog/related-note-2/)
```

Rules:
1. Place `## Related` as the **last heading** in the file.
2. Include **2–4 links** to semantically related notes.
3. Prefer bidirectional links (if A links to B, B should link to A).

---

## 6. Writing Style

| Rule | Detail |
|------|--------|
| **Language** | 繁體中文 (zh-tw) for body and `description`. Technical terminology (`webhook`, `prompt`, `getStaticPaths`, `p99 latency`) stays English. Bilingual form `代理 (agent)` / `延遲 (latency)` is acceptable. See `CLAUDE.md` §Language. |
| **Lead with the insight** | First sentence = the actionable takeaway. No preamble. |
| **Bullet points** | For lists of facts, steps, or options. |
| **Tables** | For comparative data, parameter refs, or quick lookups. |
| **Headings** | `##` for sections, `###` for subsections. No skipped levels. |
| **Code blocks** | Must be copy-pasteable with language identifier (` ```bash`, ` ```yaml`). |
| **Mermaid diagrams** | `direction LR` only. 4–6 nodes max. Use project classDefs. |
| **No fluff** | No "Let's dive in", "In this article", or conversational filler. |
| **No emojis** | Unless explicitly in the original title. |
| **Terminology** | Use precise domain terms ("p99 latency" not "slow"). |

---

## 7. Build Verification Checklist

Before merging any content changes:

```bash
npm run build    # Must exit 0
```

| Check | Command | Pass Criteria |
|-------|---------|---------------|
| Build | `npm run build` | Exit code 0; Zod schema validates every frontmatter |
| Frontmatter | `npm run build` | Schema rejects missing `title`, `description`, `pubDate`, or `category` |
| Tags | Manual / `@reviewer` | All tags from controlled vocabulary |
| Links | Manual / `@content-ops` | No broken `[[wikilinks]]` |

---

## 8. Agent Integration

This document is consumed by the Claude Code prompt system:

| Agent | How It Uses System Rules |
|-------|------------------------|
| `@aihero-writer` | Applies frontmatter schema, taxonomy, and writing style across the research → draft → polish → graduate pipeline. Built-in 9-item quality checklist enforces §6 (Writing Style) and §7 (Build Verification). |
| `@categorizer` | Heuristic-only resolution of `category` from the Subject-tag priority list defined in `docs/content-taxonomy.md`. Author-wins: only fills empty fields. |
| `@content-ops` | Enforces §1 (file naming), validates §2 (frontmatter), detects broken §5 (links). Handles renames via `git mv` and post-rename link sweeps. |
| `@diagram` | Follows §6 Mermaid constraints (LR orientation, project classDefs). |

Reference this document in agent prompts via: `docs/system-rules.md`
