---
name: index-sync
description: Documents the build-time auto-regeneration of <!-- auto:start -->...<!-- auto:end --> blocks inside src/content/blog/*-index.md. The actual regen runs as `npm run prebuild` via scripts/sync-indexes.mjs — Claude does not invoke this skill at runtime. Use this doc when adding a new index file, changing marker filters, or bootstrapping markers in a freshly-created index.
---

# Index Sync — build-time auto-regeneration

Index pages under `src/content/blog/<category>-index.md` keep their list of entries auto-synced. **The mechanism is a Node script wired into `prebuild`** — `scripts/sync-indexes.mjs`. Every `npm run build` regenerates the marker regions before Astro reads them; no hand maintenance, no Claude polish step required.

This skill is **documentation**, not an action surface. Claude does not "invoke" it during writing. The build does the work.

## 1. Marker grammar

Each auto-managed region is delimited by HTML comments. Bytes outside the markers are immutable.

```md
<!-- auto:start category=<cat> [type=<tag>] [tech=<tag>] [filename-prefix=<p>[,<p>...]] [sort=<order>] -->
- [Title](slug/)
- ...
<!-- auto:end -->
```

### Required attribute

- `category=<cat>` — one of `CATEGORIES` from `src/content.config.ts`. Posts not matching are excluded.

### Optional filters (AND-combined)

- `type=<tag>` — entry's `tags:` array must include this Type-dimension tag (e.g. `faq`, `sop`, `skill-definition`, `template`).
- `tech=<tag>` — entry's `tags:` array must include this Tech-dimension tag (e.g. `gemini`, `n8n`, `mcp`).
- `filename-prefix=<p>[,<p>...]` — entry's slug must start with one of the comma-separated prefixes. Used for chapter ports (`filename-prefix=ch`) or grouped guides.

### Sort

- `sort=pubDate-desc` (default) — newest first.
- `sort=pubDate-asc` — oldest first.
- `sort=title` — alphabetical, locale-insensitive.

### Always excluded

- `draft: true` posts.
- The index file itself (any file ending in `-index.md`).
- `._*` macOS metadata files.

## 2. Adding a new index file

1. Create `src/content/blog/<category-or-subcategory>-index.md` with the standard frontmatter (tags include `reference`, category matches the listing).
2. Place exactly one (or more) `<!-- auto:start ... --> ... <!-- auto:end -->` block where the entry list belongs.
3. Run `npm run sync:indexes` to populate, or just `npm run build` (prebuild does it).

**Example — flat category index:**

```md
---
title: SEO & GEO
description: Index of SEO and GEO strategy notes
pubDate: 2026-04-14
category: seo-and-geo
tags: [reference, seo]
---

SEO 與 Generative Engine Optimization 策略筆記。

<!-- auto:start category=seo-and-geo -->
<!-- auto:end -->
```

**Example — multi-block with editorial structure (see `openclaw-index.md`):**

```md
## 架構章節

<!-- auto:start category=openclaw filename-prefix=ch sort=title -->
<!-- auto:end -->

## 子分類

- [Common Questions](openclaw-common-questions-index/)
- [Instruction Notes](openclaw-instruction-notes-index/)
- [Skill Notes](openclaw-skill-notes-index/)
```

The hand-written "子分類" list lives outside the markers — immutable.

## 3. Behavior on build

`prebuild` runs `node scripts/sync-indexes.mjs`, which:

1. Scans `src/content/blog/*.md`, parses frontmatter via `gray-matter`.
2. For each `*-index.md`, finds every `auto:start`/`auto:end` pair.
3. Regenerates the contents based on the attributes.
4. Writes back if changed (logs `(changed)`); leaves alone if byte-identical (logs `(unchanged)`).
5. Throws if a marker is missing `category=`.

Output appears at the head of `npm run build`. Stale state is impossible: the build always regenerates before reading.

## 4. Local commands

- `npm run sync:indexes` — regenerate without building.
- `npm run build` — full build, prebuild runs first.

## 5. What this skill is NOT

- **Not invoked by Claude during writing.** The writer pipeline used to call this skill in polish; that step is now redundant. Build covers it.
- **Not a runtime tool.** The script lives in `scripts/sync-indexes.mjs`. To change behavior, edit the script.
- **Not responsible for creating new index files.** Bootstrapping is manual (see §2). The script only regenerates *existing* marker regions.

## 6. Failure modes to be aware of

| Failure | Cause | Fix |
|---|---|---|
| Build fails: `marker missing category=` | An `auto:start` without `category=` attribute | Add `category=<cat>` to the marker |
| Index page renders empty list | No posts match the filter combination | Loosen filters; check post tags |
| Duplicate-titled entries | Two posts share `title:` in frontmatter | Fix one of the post titles — script doesn't dedupe |
| New post not appearing | Post is `draft: true`, or filename ends in `-index` | Set `draft: false`; rename if not actually an index |
