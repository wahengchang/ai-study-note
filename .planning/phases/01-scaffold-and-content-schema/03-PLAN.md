---
phase: 01-scaffold-and-content-schema
plan: 03
type: execute
wave: 2
depends_on:
  - 01
  - 02
files_modified:
  - src/content.config.ts
  - src/content/blog/_scaffold-check.md
autonomous: true
requirements:
  - SCHE-01
  - SCHE-02
  - SCHE-03

must_haves:
  truths:
    - "`src/content.config.ts` exists at the `src/` ROOT (not under `src/content/`) and is picked up by Astro 6"
    - "The Zod schema requires `title`, `description`, `pubDate`, `category` — none have `.default(...)` — and also declares `tags` (default `[]`) and `draft` (default `false`)"
    - "`category` and every element of `tags` are normalized via `.toLowerCase().trim()`"
    - "`astro build` succeeds against a valid seed note `src/content/blog/_scaffold-check.md`"
    - "`astro build` fails with a Zod validation error when a required field (e.g. `title`) is missing — proven by a scripted, recoverable test"
  artifacts:
    - path: "src/content.config.ts"
      provides: "Blog collection definition via glob() loader + Zod schema"
      contains: "defineCollection"
      exports:
        - "collections"
    - path: "src/content/blog/_scaffold-check.md"
      provides: "Seed note proving the schema accepts a valid document end-to-end"
      contains: "draft: true"
  key_links:
    - from: "src/content.config.ts"
      to: "astro:content"
      via: "import defineCollection and z from astro:content"
      pattern: "from \"astro:content\""
    - from: "src/content.config.ts"
      to: "glob loader"
      via: "import glob from astro/loaders"
      pattern: "from \"astro/loaders\""
    - from: "src/content.config.ts"
      to: "src/content/blog/"
      via: "glob pattern **/*.md with base ./src/content/blog"
      pattern: "base: \"\\./src/content/blog\""
---

<objective>
Define the type-safe `blog` content collection so Phase 2's migration has a contract to write against, and prove the schema rejects malformed frontmatter.

Purpose:
- SCHE-01: `src/content.config.ts` at the `src/` root with a `blog` collection via `glob()` loader
- SCHE-02: Zod schema validates `{ title, description, pubDate, category, tags, draft }` with `.toLowerCase().trim()` on category/tags
- SCHE-03: Schema fails the build on malformed frontmatter (no silent defaults for required fields)

Output:
- `src/content.config.ts` at `src/` root (NOT `src/content/config.ts` — Astro 6 no longer resolves the legacy path)
- `src/content/blog/_scaffold-check.md` seed note with complete valid frontmatter (Phase 2 deletes this)
- A reproducible scripted proof that `astro build` fails loudly when a required field is missing
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/01-scaffold-and-content-schema/01-CONTEXT.md
@.planning/phases/01-scaffold-and-content-schema/02-SUMMARY.md

<interfaces>
Verbatim schema from PROJECT.md / architecture reference. Executor uses this directly.

`src/content.config.ts` (verbatim):

```ts
import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    category: z.string().toLowerCase().trim(),
    tags: z.array(z.string().toLowerCase().trim()).default([]),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
```

Key contract for downstream phases (Phase 2 migration, Phase 3 layouts):
- Required (no defaults): `title: string`, `description: string`, `pubDate: Date`, `category: string`
- Defaulted (safe to omit): `tags: string[] = []`, `draft: boolean = false`
- Normalization: `category` and each `tag` are lowercased and trimmed at schema level
- Loader pattern: `**/*.md` relative to `./src/content/blog` — nested folders allowed, non-`.md` files ignored
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Write src/content.config.ts with Zod schema and add valid seed note</name>
  <files>src/content.config.ts, src/content/blog/_scaffold-check.md</files>
  <behavior>
    - `src/content.config.ts` exists at `src/` root (not `src/content/config.ts`)
    - Schema exports `collections` with a `blog` key
    - Required fields (title, description, pubDate, category) have no `.default(...)` call anywhere on their line
    - `tags` defaults to `[]`; `draft` defaults to `false`
    - `category` and array items in `tags` carry `.toLowerCase().trim()`
    - `npm run build` succeeds with the seed note present and passes schema validation
  </behavior>
  <read_first>
    - .planning/PROJECT.md (verbatim schema — non-negotiable)
    - .planning/phases/01-scaffold-and-content-schema/01-CONTEXT.md (specifics block — seed note is `_scaffold-check.md` with `draft: true`)
    - .planning/phases/01-scaffold-and-content-schema/02-SUMMARY.md (confirm Plan 02 landed Astro 6 and the scaffold builds green)
    - package.json (confirm `astro` is installed)
    - Directory layout: confirm `src/` exists (from Plan 02) and `src/content/` does not yet exist
  </read_first>
  <action>
    Step 1 — Create `src/content.config.ts` at the `src/` ROOT (adjacent to `src/pages/`, NOT inside `src/content/`). Content must be exactly:

    ```ts
    import { defineCollection, z } from "astro:content";
    import { glob } from "astro/loaders";

    const blog = defineCollection({
      loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
      schema: z.object({
        title: z.string(),
        description: z.string(),
        pubDate: z.coerce.date(),
        category: z.string().toLowerCase().trim(),
        tags: z.array(z.string().toLowerCase().trim()).default([]),
        draft: z.boolean().default(false),
      }),
    });

    export const collections = { blog };
    ```

    Path sanity check: `ls src/content.config.ts` must succeed; `ls src/content/config.ts` must fail. Astro 6 does not resolve the legacy `src/content/config.ts` location.

    Step 2 — Create the seed note at `src/content/blog/_scaffold-check.md` (leading underscore is a conventional "ignore-me" prefix). Content exactly:

    ```md
    ---
    title: "Scaffold Check"
    description: "Temporary seed note to exercise the content schema end-to-end. Deleted in Phase 2."
    pubDate: 2026-04-21
    category: "Scaffold"
    tags: ["Astro", "Migration"]
    draft: true
    ---

    This note exists only to prove that src/content.config.ts validates a real document.
    Phase 2 deletes this file when real content lands.
    ```

    Note the deliberate case in `category: "Scaffold"` and `tags: ["Astro", "Migration"]` — the schema should normalize these to `scaffold` and `["astro", "migration"]`. Phase 2 can sanity-check normalization by importing the collection.

    Step 3 — Run a schema-validated build. Must pass.

    ```bash
    npm run build
    ```

    Exit code must be 0. Build output must include the blog collection (Astro prints `Collections` / content sync lines in its build log).
  </action>
  <verify>
    <automated>test -f src/content.config.ts &amp;&amp; ! test -f src/content/config.ts &amp;&amp; grep -q 'from "astro:content"' src/content.config.ts &amp;&amp; grep -q 'from "astro/loaders"' src/content.config.ts &amp;&amp; grep -q 'base: "./src/content/blog"' src/content.config.ts &amp;&amp; grep -q "z.coerce.date()" src/content.config.ts &amp;&amp; grep -q "toLowerCase().trim()" src/content.config.ts &amp;&amp; test -f src/content/blog/_scaffold-check.md &amp;&amp; grep -q "draft: true" src/content/blog/_scaffold-check.md &amp;&amp; npm run build</automated>
  </verify>
  <acceptance_criteria>
    - `test -f src/content.config.ts` succeeds
    - `test -f src/content/config.ts` FAILS (legacy path must NOT exist)
    - `grep -c 'from "astro:content"' src/content.config.ts` returns 1
    - `grep -c 'from "astro/loaders"' src/content.config.ts` returns 1
    - `grep -c 'base: "./src/content/blog"' src/content.config.ts` returns 1
    - `grep -c "z.coerce.date()" src/content.config.ts` returns 1
    - `grep -c "z.string().toLowerCase().trim()" src/content.config.ts` returns at least 2 (once for category, once for tag array element)
    - No `.default(` appears on the lines defining `title`, `description`, `pubDate`, or `category`. Verify: `awk '/title:|description:|pubDate:|^  *category:/' src/content.config.ts | grep -c "\.default("` returns 0
    - `grep -c "\.default(\[\])" src/content.config.ts` returns 1 (tags default)
    - `grep -c "\.default(false)" src/content.config.ts` returns 1 (draft default)
    - `grep -c "export const collections" src/content.config.ts` returns 1
    - `test -f src/content/blog/_scaffold-check.md` succeeds
    - `grep -c "^draft: true$" src/content/blog/_scaffold-check.md` returns 1
    - `npm run build` exits 0
  </acceptance_criteria>
  <done>Content config file on disk at correct path; seed note on disk with complete valid frontmatter; `npm run build` completes with exit 0 and the schema accepts the seed note without warnings about missing fields.</done>
</task>

<task type="auto">
  <name>Task 2: Prove the schema fails loudly on malformed frontmatter (SCHE-03 negative test)</name>
  <files>src/content/blog/_scaffold-check.md</files>
  <read_first>
    - src/content.config.ts (confirm the schema committed in Task 1 has no `.default(...)` on required fields)
    - src/content/blog/_scaffold-check.md (the valid seed note — this task temporarily breaks it, then restores)
    - .planning/ROADMAP.md (Phase 1 success criterion #4: "Running `astro build` against a deliberately malformed frontmatter file fails loudly with a schema error")
  </read_first>
  <action>
    Goal: produce an automated, repeatable proof that Zod rejects missing required fields. This is the SCHE-03 smoking gun.

    Step 1 — Static schema audit. Confirm no silent defaults on required fields.

    ```bash
    # Required fields must not have .default() on their line
    awk '/^[[:space:]]*(title|description|pubDate|category):/' src/content.config.ts | tee /tmp/required-fields.txt
    if grep -q "\.default(" /tmp/required-fields.txt; then
      echo "FAIL: a required field has a .default() silent fallback"
      cat /tmp/required-fields.txt
      exit 1
    fi
    echo "PASS: required fields have no silent defaults"
    ```

    This must print PASS. If it prints FAIL, fix `src/content.config.ts` before proceeding.

    Step 2 — Dynamic proof. Break the seed frontmatter, confirm build fails with a schema error, then restore.

    Use this exact script, running from the repo root. It backs up the seed note, writes a broken version (missing `title`), runs the build, expects a NON-ZERO exit, greps the captured output for schema-failure signals, then restores the original.

    ```bash
    set -e
    SEED="src/content/blog/_scaffold-check.md"
    BACKUP="$(mktemp)"
    LOG="$(mktemp)"
    cp "$SEED" "$BACKUP"

    # Write a deliberately malformed version — title removed, description removed
    cat > "$SEED" <<'MALFORMED'
    ---
    pubDate: 2026-04-21
    category: "Scaffold"
    ---

    Missing required title and description — schema MUST reject this.
    MALFORMED

    # Run build — capture output, expect FAILURE
    if npm run build > "$LOG" 2>&1; then
      echo "FAIL: astro build succeeded on malformed frontmatter — schema has silent defaults"
      cp "$BACKUP" "$SEED"
      rm -f "$BACKUP" "$LOG"
      exit 1
    fi

    # Build failed — confirm the failure is a Zod schema error (not some unrelated crash)
    if ! grep -qiE "(zod|invalid|required|title|description|schema)" "$LOG"; then
      echo "FAIL: build failed but not for schema reasons"
      cat "$LOG"
      cp "$BACKUP" "$SEED"
      rm -f "$BACKUP" "$LOG"
      exit 1
    fi

    echo "PASS: astro build rejected malformed frontmatter with a schema error"

    # Restore original seed
    cp "$BACKUP" "$SEED"
    rm -f "$BACKUP" "$LOG"

    # Confirm restored build still passes
    npm run build
    ```

    The script is idempotent and leaves the repo in its original state. Include the final PASS transcript in the plan summary.

    Step 3 — Final sanity check: after restoration, `npm run build` must still exit 0 and the seed note's frontmatter must match what Task 1 wrote.

    ```bash
    grep -q '^title: "Scaffold Check"$' src/content/blog/_scaffold-check.md
    grep -q '^draft: true$' src/content/blog/_scaffold-check.md
    ```
  </action>
  <verify>
    <automated>awk '/^[[:space:]]*(title|description|pubDate|category):/' src/content.config.ts | { ! grep -q "\.default("; } &amp;&amp; grep -q '^title: "Scaffold Check"$' src/content/blog/_scaffold-check.md &amp;&amp; npm run build</automated>
  </verify>
  <acceptance_criteria>
    - Static audit: `awk '/^[[:space:]]*(title|description|pubDate|category):/' src/content.config.ts | grep -c "\.default("` returns 0
    - Dynamic proof: the malformed-frontmatter script above runs and prints exactly one `PASS:` line from the schema-rejection branch (captured in the summary)
    - Build failure log contained at least one of: `zod`, `invalid`, `required`, `title`, `description`, `schema` (case-insensitive)
    - After the script runs, the seed file is byte-identical to Task 1's output: `grep -c '^title: "Scaffold Check"$' src/content/blog/_scaffold-check.md` returns 1 AND `grep -c '^draft: true$' src/content/blog/_scaffold-check.md` returns 1
    - Final `npm run build` exits 0 (site builds cleanly after restore)
  </acceptance_criteria>
  <done>SCHE-03 proven two ways: (1) static check shows required fields carry no `.default()`; (2) dynamic script deliberately breaks frontmatter, confirms `astro build` fails with a schema-shaped error, then restores the seed and confirms the build is green again. Summary includes the transcript of the PASS output from the dynamic test.</done>
</task>

</tasks>

<verification>
After both tasks:

```bash
# Config file at the correct path
test -f src/content.config.ts
! test -f src/content/config.ts

# Seed present and valid
test -f src/content/blog/_scaffold-check.md
grep -q '^title: "Scaffold Check"$' src/content/blog/_scaffold-check.md
grep -q '^draft: true$' src/content/blog/_scaffold-check.md

# Schema shape: required fields have no .default()
awk '/^[[:space:]]*(title|description|pubDate|category):/' src/content.config.ts | { ! grep -q "\.default("; }

# Normalization present on category and tags
grep -c "z.string().toLowerCase().trim()" src/content.config.ts   # >= 2

# Build is green against the valid seed
npm run build
```

All commands exit 0 (or exit 1 for negations). Task 2's dynamic script must also have reported PASS in its summary transcript.
</verification>

<success_criteria>
- SCHE-01: `src/content.config.ts` exists at `src/` root, uses `glob()` loader with `base: "./src/content/blog"`
- SCHE-02: Zod schema contains `title`, `description`, `pubDate: z.coerce.date()`, `category: z.string().toLowerCase().trim()`, `tags: z.array(z.string().toLowerCase().trim()).default([])`, `draft: z.boolean().default(false)`; exports `collections`
- SCHE-03: Proven statically (no `.default()` on required fields) AND dynamically (build fails on malformed seed, passes after restore)
- Phase 1 goal check: the valid seed note builds end-to-end without errors, giving Phase 2's migration a working contract
</success_criteria>

<output>
After completion, create `.planning/phases/01-scaffold-and-content-schema/03-SUMMARY.md`. In the summary, paste the PASS transcript from Task 2's dynamic test so future readers can see the schema enforcement was actually exercised, not just inspected. Note that `_scaffold-check.md` will be deleted by Phase 2.
</output>
