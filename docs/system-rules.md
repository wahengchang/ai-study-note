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
| `title` | `string` | Display title. Use quotes if it contains colons or special chars. |
| `description` | `string` | One-line summary (≤160 chars). Used for SEO meta and card lists. |
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

Tags are **lateral associations** that cross-cut the folder hierarchy. Use only tags from this controlled vocabulary.

### Platform Tags

| Tag | Scope |
|-----|-------|
| `claude-code` | Claude Code CLI, extensions, plugins, hooks |
| `openclaw` | OpenClaw agent framework |
| `gemini` | Google Gemini / Gemini API |
| `google-workspace` | Google Docs, Sheets, Slides, Gmail, Meet |

### Topic Tags

| Tag | Scope |
|-----|-------|
| `agent-architecture` | Agent loops, runtime, system design |
| `context-window` | Context budgets, prompt assembly, compaction |
| `memory` | Persistence, retrieval, indexing |
| `workspace` | Agent home directories, file structures |
| `multi-agent` | Multi-agent coordination, routing, presence |
| `routing` | Binding rules, agent selection, skill discovery |
| `automation` | Cron, workflows, scripted pipelines |
| `prompt-engineering` | Prompt design, templates, reusable patterns |
| `plugin` | MCP plugins, channels, extensions |
| `telegram` | Telegram bot integration, bridging |
| `n8n` | n8n workflow automation |
| `devops` | Environment setup, deployment, infrastructure |
| `seo` | Search engine optimization, entity strategy |
| `tts` | Text-to-speech synthesis |
| `tmux` | Terminal multiplexer operations |
| `research` | Notes derived from external sources (YouTube, articles, GitHub repos, official docs) |
| `skill-definition` | OpenAI-compatible SKILL.md definitions |
| `marketing` | Marketing strategy, campaigns |
| `hr` | Human resources, hiring, onboarding |
| `sales` | Sales process, prospecting |
| `customer-service` | Support, complaint handling |
| `communications` | PR, internal comms |
| `project-management` | Planning, tracking, retrospectives |
| `admin` | Administrative operations |

### Type Tags

| Tag | Scope |
|-----|-------|
| `guide` | Structured walkthrough of a concept or system |
| `reference` | Quick-lookup table, cheat sheet, or index |
| `tutorial` | Step-by-step hands-on instructions |
| `playbook` | Decision-ready scenarios and real-world patterns |
| `sop` | Standard operating procedure for repeatable tasks |
| `template` | Reusable prompt or document skeleton |

### Tagging Rules

1. Every note must have **at least one platform tag** and **one type tag**.
2. Add **1–3 topic tags** that describe the note's subject matter.
3. Use **lowercase-kebab-case** for all tags. No capitals, no spaces.
4. Do not invent new tags without adding them to this taxonomy first.
5. Tags drive `/tags/<tag>/` page generation — each tag gets its own page via `src/pages/tags/[tag].astro`.

---

## 4. Categories (Flat Layout)

After the Astro migration, `src/content/blog/` uses a **flat directory**: every note lives at `src/content/blog/<slug>.md`. Categorization is expressed via the `category` frontmatter field, not the folder tree.

### Approved categories

| Category | Scope |
|----------|-------|
| `claude-code` | Claude Code ecosystem — CLI, plugins, hooks, agent teams, frameworks |
| `openclaw` | OpenClaw agent framework — architecture, FAQs, SOPs, skills |
| `prompt-notes` | Prompt engineering research and reusable templates |
| `seo-and-geo` | SEO & GEO strategy |
| `setup-env` | Development environment and tooling setup |

### Rules

1. Every note sets exactly one `category` in frontmatter. Value matches the slug-style strings above (lowercase-kebab-case).
2. New categories require approval — do not introduce new values without discussion.
3. Category pages are generated automatically at `/categories/<name>/` by `src/pages/categories/[category].astro`.

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
| `@writer` | Applies frontmatter schema, tag taxonomy, and writing style when creating notes |
| `@reviewer` | Audits notes against all rules — flags violations as BLOCK/WARN/INFO |
| `@content-ops` | Enforces file naming, validates frontmatter, detects broken links |
| `@diagram` | Follows Mermaid constraints (LR orientation, project classDefs) |

Reference this document in agent prompts via: `docs/system-rules.md`
