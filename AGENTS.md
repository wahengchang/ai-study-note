# AI Study Note — Claude Code Configuration

An Astro-powered digital garden of AI learning notes, deployed to GitHub Pages at https://wahengchang.github.io/ai-study-note/.

This file focuses on the **writing workflow** and **safety invariants** Claude must respect on every action. Detailed guidelines live in `docs/`; see the bottom of this file.

> **Project portability rule.** All project context lives in this repo — `CLAUDE.md`, `docs/`, `.claude/`. **Do not use Claude Code's per-machine memory system** (`~/.claude/projects/.../memory/`). Other team members and other machines must have the same context, so anything worth remembering goes into a tracked file here.

## Scope

| Directory | Purpose |
|-----------|---------|
| `src/content/blog/` | Published notes (flat layout, kebab-case = URL slug). The writing workflow writes here directly. |
| `src/content.config.ts` | Zod schema for the `blog` collection |
| `src/pages/` | Routes: `index`, `404`, `blog/`, `categories/`, `tags/` |
| `public/assets/` | Images referenced from notes |
| `docs/` | Canonical guidelines (taxonomy, system rules, dev, design) |
| `.claude/` | Standard Claude Code project — agents, skills, prompts, config |

## Writing Workflow

The pipeline is **single-pass auto-pilot** — no sign-off gates. The agent researches, writes directly to `src/content/blog/`, polishes in place, builds, and reports. The user can interrupt at any time.

```
seed → [research, smart-skip, silent .research/<slug>.md] → write src/content/blog/<slug>.md → polish → build → done
```

The agent only halts on four conditions: no artifact possible, ambiguous category, no honest iteration moment in source material, or build fails. Everything else is decided and shipped.

### Agents

- **`@aihero-writer`** — Canonical writer. Single-pass auto-pilot: research → write directly to `blog/` → polish → build. AI-Hero-style (one named concept, one copy-pasteable artifact, opinionated, honest about failure). Default length `short` (400–800w); `medium` and `chapter` available. Auto-invokes `@categorizer` in polish phase.
- **`@categorizer`** — Fill `category:`/`tags:` from the closed vocabulary; regen `*-index.md` auto blocks. Heuristic-only, author wins, never overwrites set values.
- **`@diagram`** — Generate or refactor Mermaid diagrams (LR only).
- **`@content-ops`** — File renames, taxonomy migrations, bulk content maintenance.

Full pipeline spec: `.claude/agents/aihero-writer.md`. Skill rules: `.claude/skills/research-and-write/SKILL.md`.

## Language

This site is for **繁體中文 (zh-tw / Traditional Chinese, Taiwan)** readers. **All content is written in zh-tw by default.** Non-negotiable.

- **Body**: zh-tw prose. Write for a Taiwanese reader, not an English-speaking one.
- **Technical terminology** (library names, API names, code identifiers, command flags, error codes): stay in English. Don't translate `webhook`, `prompt`, `commit`, `getStaticPaths`, `p99 latency`.
- **Hard-to-translate concepts**: English is acceptable. Don't force a clumsy translation.
- **Bilingual form** is encouraged when a Chinese rendering exists but isn't widely recognized: `代理 (agent)`, `延遲 (latency)`, `脈絡 (context)`. Pattern: `<zh-tw> (<english>)`.
- **Title**: zh-tw, English, or mixed — all acceptable, matching the existing corpus (`Ch1: OpenClaw 架構：四大支柱`, `Telegram Bot 橋接 Claude Code 運作原理`).
- **Description**: zh-tw. The schema allows ≤160 chars; Chinese is denser, so ~80 zh-tw chars fits. (Replaces the prior English-only convention.)
- **Code blocks, frontmatter values, file/directory names, URL slugs**: always English/ASCII. `kebab-case` for filenames.

If a post comes back English-only, that's a polish-phase block — same severity as a missing artifact.

## Safety Invariants

These rules Claude must respect every action. Violating them breaks the build or the live site.

1. **Closed category vocabulary.** `category:` must be one of the values in `CATEGORIES` (`src/content.config.ts`). Build fails on typos via `z.enum`. Adding a new category requires editing the enum *and* `docs/content-taxonomy.md` in the same commit.
2. **Tag-as-truth.** Category is *derived* from the post's Subject tag via the priority list in `.claude/skills/categorize/SKILL.md` §3. Edit tags to change category — never edit the category field alone.
3. **Draft filter.** Every `getCollection("blog", ...)` call must pass `({ data }) => !data.draft`. No exceptions.
4. **`BASE_URL` for internal links.** Use `${import.meta.env.BASE_URL}...` in components/code; absolute base-prefixed paths in markdown (`/ai-study-note/...`). Never hardcode `/blog/`, `/categories/`, `/tags/`, or asset paths.
5. **No Obsidian syntax in posts.** No `[[wikilinks]]`, no `![[embeds]]`, no `:::col` Smart Columns. They were stripped during the Astro migration; the build will not parse them.
6. **kebab-case filenames.** Filename = URL slug. No spaces, PascalCase, camelCase, or special characters.
7. **No relative markdown links between posts.** `./foo.md`, `../bar.md` look fine in source but render as 404s on the deployed site (each post is at `/ai-study-note/blog/<slug>/`, not `/blog/<slug>.md`). Cross-link via the base-prefixed absolute form `/ai-study-note/blog/<target-slug>/`. Roughly 17 legacy posts contain such links — known issue, grandfathered; do not add new ones.
8. **No generic single-word slugs.** Filenames like `admin.md`, `marketing.md`, `general.md`, `hr.md`, `sales.md`, `executives.md`, `customer-service.md`, `communications.md`, `project-management.md` are reserved for the existing Gemini prompt corpus. New posts must use a topic-specific slug (`gemini-prompt-marketing-brief.md`, not `marketing.md`). The writer pipeline tempts one-word slugs from one-word topics; reject them at slug-naming time.

## Two pages share the word "index" — they are not the same artifact

- **`/categories/<cat>/`** is **auto-generated by Astro** from `getCollection("blog")` filtered by `category`. Exists for every category in `CATEGORIES`. Plain post list, no editorial structure.
- **`src/content/blog/<cat>-index.md`** is an **editorial overview with auto-managed lists**. The prose, headings, and cross-references between sub-indexes are hand-written; the post listings inside `<!-- auto:start ... --> ... <!-- auto:end -->` markers are regenerated by `scripts/sync-indexes.mjs` on every `npm run build` (wired as `prebuild`). **Never hand-edit content inside the markers.** See `.claude/skills/index-sync/SKILL.md` for marker grammar.

The two pages serve different purposes (Astro list vs. editorial overview) and are both live. Updating one does not update the other. Do not delete a `<cat>-index.md` file thinking it's redundant with the auto Astro page — and do not hand-maintain its entry list.

## See also

- **`docs/content-taxonomy.md`** — Closed vocabulary for `category` (5 values) and tags (3 dimensions: Type / Subject / Tech) plus the banned-tag normalization table. Read before adding a new category or tag.
- **`docs/system-rules.md`** — Full content governance: file/folder naming, frontmatter schema, tag rules, linking protocols, writing style, build verification. Canonical superset of the safety invariants above.
- **`docs/dev.md`** — Architecture (page tree, `getStaticPaths` pattern), commands, deployment, config files, build invariants. Read when working on layouts, components, or build infra.
- **`docs/visual-guideline.md`** — Design tokens, typography, layout. Read when changing styles.
- **`.claude/agents/aihero-writer.md`** — Full pipeline spec for the writing workflow.
- **`.claude/skills/research-and-write/SKILL.md`** — Single-pass rules, halt conditions, and the quality checklist.
- **`README.md`** — Public-facing project overview, repo structure, and external references.
