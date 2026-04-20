# Phase 2: Content Migration - Context

**Gathered:** 2026-04-21
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Every existing note lives under `src/content/blog/` with frontmatter that the Phase 1 Zod schema accepts; no Obsidian-flavored syntax remains.

Covers:
- Moving 84 Markdown files from `content/` tree → `src/content/blog/` tree (flat, slug-equivalent filenames)
- Normalizing frontmatter to `{ title, description, pubDate, category, tags, draft }`
- Stripping Obsidian wikilinks (`[[name]]`, `![[image.png]]`) and Smart Columns (`:::col`) fences
- Migrating referenced images from `content/assets/` to `public/` (preserving base path accessibility)
- Removing the old top-level `content/` directory
- Removing the `src/content/blog/_scaffold-check.md` seed note from Phase 1
- Verifying `npm run build` succeeds against the full migrated set

Does NOT cover:
- Layouts/pages/routes (Phase 3)
- Deploy pipeline (Phase 4)

</domain>

<decisions>
## Implementation Decisions

### Non-negotiable (from PROJECT.md)
- Target schema: `{ title: z.string(), description: z.string(), pubDate: z.coerce.date(), category: z.string().toLowerCase().trim(), tags: z.array(z.string().toLowerCase().trim()).default([]), draft: z.boolean().default(false) }`
- Files live in `src/content/blog/**/*.md` (glob pattern per `src/content.config.ts`)
- Filename = URL slug; preserve existing filenames (kebab-case) when possible

### Migration approach
- Write a single Node.js migration script (`scripts/migrate-content.mjs`) that is idempotent and reports progress. This is safer than 84 manual edits and leaves a record of the transformation rules.
- Script responsibilities:
  1. Walk `content/` recursively, pick up every `.md` file (excluding `content/assets/`)
  2. Parse existing frontmatter (`gray-matter` or manual regex — prefer gray-matter via npx)
  3. Derive each missing required field:
     - `title`: already present in most notes; fall back to filename humanized
     - `description`: already present in most; fall back to first non-heading paragraph (trimmed to ~160 chars)
     - `pubDate`: use `git log --diff-filter=A --format=%aI -- <file> | tail -1` for original add date; fall back to current date
     - `category`: infer from parent directory name (e.g. `content/OpenClaw/...md` → `openclaw`); flatten nested subdirectories to a single `category` — the top-level folder under `content/` is the category
     - `tags`: preserve existing tags; skip normalization at write time (schema normalizes on load)
     - `draft`: preserve if present, default `false`
  4. Transform body:
     - `![[file.png]]` → `![](base/assets/file.png)` using `import.meta.env.BASE_URL` — but inside Markdown bodies we can't use template literals, so use plain `/ai-study-note/assets/file.png` absolute paths (Astro base path). Assets must live at `public/assets/*` so the built URL resolves.
     - `[[note-name]]` → plain text of the link label (drop the wikilink; leave a note comment `<!-- was: [[note-name]] -->` only if helpful — usually just drop)
     - `[[note-name|label]]` → `label` (drop link, keep text)
     - `:::col` and `:::` fence pairs → remove fences entirely (content between remains as plain Markdown)
  5. Write transformed file to `src/content/blog/<filename>` (flat — no subdirectory nesting)
  6. Handle filename collisions (if two notes have the same basename across different folders) by prefixing with category (e.g. `openclaw-foo.md`)
  7. Copy `content/assets/**` → `public/assets/**`

- Script runs once (committed), the old `content/` dir is deleted, and subsequent authors add notes directly into `src/content/blog/`.

### Claude's Discretion
- Whether to keep the migration script in-tree post-migration (recommended: yes, under `scripts/`, for historical reference) or delete it
- Whether nested directories under `src/content/blog/` are OK — PROJECT.md says "flat" implicitly, but the glob pattern `**/*.md` supports nesting. Recommendation: flatten to a single level with category-prefixed filenames where collisions occur, otherwise keep the original filename.
- Handling of non-Markdown content (images, PDFs in `content/assets/`) — move to `public/assets/` so absolute URLs `/ai-study-note/assets/*.png` resolve in both dev and prod.
- The seed `_scaffold-check.md` from Phase 1 should be deleted in this phase.

</decisions>

<code_context>
## Existing Code Insights

### Current content shape (sampled)
- 84 `.md` files under `content/` in nested dirs (OpenClaw/, claude-code/, prompt-notes/, seo-and-geo/, setup-env/, assets/).
- Most notes have `title`, `tags`, `description` frontmatter; many have `aliases`.
- Content uses Obsidian image wikilinks: `![[openclaw-4-pillar.png]]`, `![[agent-loop.png]]`.
- Likely sporadic `[[note-name]]` cross-reference wikilinks.
- Chinese (Traditional) content is heavy in the OpenClaw notes — keep UTF-8 handling.
- Smart Columns `:::col` fences may appear; project docs reference them.

### Assets
- `content/assets/` has images referenced via wikilinks.

### Schema contract (defined by Phase 1)
- `src/content.config.ts` at `src/` ROOT
- `glob({ pattern: "**/*.md", base: "./src/content/blog" })`
- Validation fails build on missing required fields (SCHE-03 proven)

### Integration Points
- Phase 3 routes (`/categories/<category>/`, `/tags/<tag>/`) will read `data.category` and `data.tags` — these must be populated on every migrated note.
- Phase 3 post-detail route uses filename as slug — filenames must be URL-safe (kebab-case, ASCII preferred but Astro supports Unicode slugs).

</code_context>

<specifics>
## Specific Ideas

- Commit the migration script separately from the content commit so the transformation log is auditable.
- Suggested commit plan:
  1. `chore(02): add content migration script` — script + deps (gray-matter, js-yaml if needed)
  2. `feat(02): migrate 84 notes to src/content/blog with normalized frontmatter` — bulk content move + assets copy
  3. `chore(02): remove legacy content/ directory and scaffold-check seed` — cleanup
- Verify with `npm run build` between commits 2 and 3.

</specifics>

<deferred>
## Deferred Ideas

- Per-note manual review (too many notes; trust the script + build validation)
- MDX support (current pattern is `*.md` only — add if/when an author needs components in content)
- Converting `[[note-name]]` wikilinks into actual Astro links — requires knowing the destination slug set; defer to a v2 "internal links" polish phase if needed.

</deferred>
