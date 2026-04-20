---
phase: 01-scaffold-and-content-schema
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - package-lock.json
  - tsconfig.json
  - astro.config.mjs
  - .nvmrc
  - src/styles/global.css
  - src/pages/index.astro
autonomous: true
requirements:
  - SCAF-01
  - SCAF-02
  - SCAF-03

must_haves:
  truths:
    - "`npm install` completes without errors"
    - "`npm run build` produces a `dist/` directory with no errors (even before any content is present)"
    - "`astro.config.mjs` exports a config with `site`, `base: '/ai-study-note'`, `trailingSlash: 'always'`, `build.format: 'directory'`, and Tailwind 4 wired via `@tailwindcss/vite`"
    - "`src/styles/global.css` imports tailwindcss and registers the typography plugin"
    - "Node 22 is pinned via `.nvmrc`"
    - "Quartz scripts and dependencies have been removed from `package.json` (wholesale replacement)"
  artifacts:
    - path: "package.json"
      provides: "Astro + Tailwind 4 dependencies, standard Astro scripts"
      contains: "astro"
    - path: "astro.config.mjs"
      provides: "Site config — base path, site URL, trailing slash, Tailwind Vite plugin"
      contains: "/ai-study-note"
    - path: "tsconfig.json"
      provides: "Astro strict TypeScript preset"
      contains: "astro/tsconfigs/strict"
    - path: ".nvmrc"
      provides: "Node version pin"
      contains: "22"
    - path: "src/styles/global.css"
      provides: "Tailwind 4 + typography plugin registration"
      contains: "@plugin \"@tailwindcss/typography\""
    - path: "src/pages/index.astro"
      provides: "Minimal placeholder home page so `astro build` has something to emit (Phase 3 replaces)"
      min_lines: 3
  key_links:
    - from: "astro.config.mjs"
      to: "@tailwindcss/vite plugin"
      via: "vite.plugins: [tailwindcss()]"
      pattern: "tailwindcss\\(\\)"
    - from: "src/styles/global.css"
      to: "tailwindcss + typography plugin"
      via: "@import / @plugin directives"
      pattern: "@import \"tailwindcss\""
    - from: "package.json"
      to: "npm scripts"
      via: "scripts.build = 'astro build'"
      pattern: "\"build\": \"astro build\""
---

<objective>
Stand up a working Astro 6 + Tailwind 4 project that `npm install && npm run build` can execute cleanly on Node 22.

Purpose: SCAF-01, SCAF-02, SCAF-03 — Astro project initialized, Node pinned, Tailwind 4 wired via `@tailwindcss/vite`, `astro.config.mjs` configured with the exact non-negotiable values from PROJECT.md.

Output: A buildable Astro shell. No layouts, no routes beyond a trivial placeholder `index.astro` — Phase 3 owns real layouts and pages.

Scope boundary: This plan OWNS `package.json` and `tsconfig.json` (wholesale replacement — Quartz deps and scripts vanish automatically). It does NOT touch `src/content.config.ts` (Plan 03) or any Quartz engine files (Plan 01).
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
@package.json
@tsconfig.json

<interfaces>
<!-- Verbatim contents required by PROJECT.md / architecture reference. Executor uses these directly. -->

astro.config.mjs (verbatim):
```js
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://wahengchang.github.io",
  base: "/ai-study-note",
  trailingSlash: "always",
  build: { format: "directory" },
  vite: { plugins: [tailwindcss()] },
});
```

src/styles/global.css (verbatim):
```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";
```

.nvmrc (single line, no trailing newline required):
```
22
```

Dependency versions (current latest compatible — verified 2026-04-21):
- astro ^6.1.8
- @tailwindcss/vite ^4.2.2
- tailwindcss ^4.2.2
- @tailwindcss/typography ^0.5.19

tsconfig.json (verbatim):
```json
{
  "extends": "astro/tsconfigs/strict",
  "include": [".astro/types.d.ts", "**/*"],
  "exclude": ["dist"]
}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace package.json, install Astro + Tailwind 4, and pin Node via .nvmrc</name>
  <files>package.json, package-lock.json, .nvmrc, node_modules/</files>
  <read_first>
    - package.json (current Quartz-shaped file — note `"type": "module"`, `author`, `license`, `homepage`, `repository` fields to preserve)
    - .planning/PROJECT.md (SCAF-01 Node pin, SCAF-02 Tailwind 4 via `@tailwindcss/vite`)
    - .planning/phases/01-scaffold-and-content-schema/01-CONTEXT.md ("Claude's Discretion" → keep scripts minimal: dev/build/preview + astro passthrough)
  </read_first>
  <action>
    Step 1 — Write `.nvmrc` with exactly one line: `22` (no trailing content).

    Step 2 — Overwrite `package.json` entirely with the following content. This replacement simultaneously satisfies SCAF-04's requirement to purge Quartz scripts and Quartz deps (they are not carried over).

    ```json
    {
      "name": "ai-study-note",
      "description": "Mr.Chang AI practice notebook — Astro edition",
      "private": true,
      "version": "5.0.0",
      "type": "module",
      "author": "wahengchang",
      "license": "MIT",
      "homepage": "https://wahengchang.github.io/ai-study-note/",
      "repository": {
        "type": "git",
        "url": "https://github.com/wahengchang/ai-study-note.git"
      },
      "scripts": {
        "dev": "astro dev",
        "build": "astro build",
        "preview": "astro preview",
        "astro": "astro"
      },
      "engines": {
        "node": ">=22.12.0",
        "npm": ">=10.9.2"
      },
      "keywords": [
        "digital-garden",
        "markdown",
        "blog",
        "astro"
      ]
    }
    ```

    Notes on what was removed vs. the Quartz `package.json`:
    - All scripts replaced (clean, dev, dev:root, quartz, docs, check, format, test, profile, kill all gone)
    - `bin.quartz` removed
    - `"quartz"` keyword removed
    - `"ssg"`, `"site generator"` keywords removed
    - Description updated to reflect Astro
    - `engines.node` bumped from `>=22` to `>=22.12.0` to match Astro 6 requirement

    Step 3 — Delete the old `package-lock.json` (Quartz lockfile is stale and incompatible):
    ```bash
    rm -f package-lock.json
    ```

    Step 4 — Delete `node_modules/` (stale Quartz install):
    ```bash
    rm -rf node_modules
    ```

    Step 5 — Install exact Astro + Tailwind 4 dependencies. Use Node 22; if `nvm` is available, run `nvm use` first (best-effort — do not fail the task if nvm is not installed, but record it in the summary).

    ```bash
    npm install astro@^6.1.8 --save-exact=false
    npm install -D @tailwindcss/vite@^4.2.2 tailwindcss@^4.2.2 @tailwindcss/typography@^0.5.19
    ```

    (Using two calls so if Astro install fails, the Tailwind install doesn't proceed against a broken tree.)

    Step 6 — Verify resolved versions match the constraints:
    ```bash
    node -e 'const p=require("./package.json");console.log("astro",p.dependencies.astro);console.log("tw-vite",p.devDependencies["@tailwindcss/vite"]);console.log("tw",p.devDependencies.tailwindcss);console.log("typography",p.devDependencies["@tailwindcss/typography"])'
    ```

    All four must print a version starting with the expected major (^6, ^4, ^4, ^0.5).

    Do not add prettier, eslint, or `@astrojs/check` in this task — out of scope per CONTEXT "Deferred Ideas".
  </action>
  <verify>
    <automated>test -f .nvmrc && grep -q "^22$" .nvmrc && node -e 'const p=require("./package.json"); if(!p.dependencies.astro) process.exit(1); if(!p.devDependencies["@tailwindcss/vite"]) process.exit(1); if(!p.devDependencies["tailwindcss"]) process.exit(1); if(!p.devDependencies["@tailwindcss/typography"]) process.exit(1); if(p.scripts.build !== "astro build") process.exit(1); if(p.scripts.quartz) process.exit(1); if(p.dependencies.preact) process.exit(1);' && test -d node_modules/astro && test -d node_modules/@tailwindcss/vite</automated>
  </verify>
  <acceptance_criteria>
    - `test -f .nvmrc && [ "$(cat .nvmrc)" = "22" ]` succeeds
    - `jq -r .scripts.build package.json` outputs `astro build`
    - `jq -r .scripts.dev package.json` outputs `astro dev`
    - `jq -r '.scripts.quartz // "absent"' package.json` outputs `absent`
    - `jq -r '.dependencies.astro' package.json` matches `^6\.` (e.g. `^6.1.8`)
    - `jq -r '.devDependencies["@tailwindcss/vite"]' package.json` matches `^4\.`
    - `jq -r '.devDependencies.tailwindcss' package.json` matches `^4\.`
    - `jq -r '.devDependencies["@tailwindcss/typography"]' package.json` matches `^0\.5\.`
    - `jq -r '.dependencies.preact // "absent"' package.json` outputs `absent` (no Quartz deps survived)
    - `jq -r '.bin.quartz // "absent"' package.json` outputs `absent`
    - `test -d node_modules/astro` succeeds
    - `test -d node_modules/@tailwindcss/vite` succeeds
    - `test -f package-lock.json` succeeds (fresh lockfile regenerated by npm install)
  </acceptance_criteria>
  <done>New `package.json` on disk with Astro 6 + Tailwind 4 deps and minimal Astro scripts. `.nvmrc` pins Node 22. `node_modules/` and `package-lock.json` freshly generated. No Quartz scripts, binaries, or dependencies remain anywhere in `package.json`.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Write astro.config.mjs, tsconfig.json, global.css, placeholder index.astro; verify `astro build`</name>
  <files>astro.config.mjs, tsconfig.json, src/styles/global.css, src/pages/index.astro</files>
  <behavior>
    - `npm run build` exits 0 (zero errors) against the placeholder site
    - `dist/` is created and contains at least one HTML file at `dist/ai-study-note/index.html` (base path applied)
    - `astro.config.mjs` evaluates without syntax errors under Node ESM
    - `tsconfig.json` extends `astro/tsconfigs/strict` and includes `.astro/types.d.ts`
    - `global.css` declares both the tailwindcss import and the typography plugin
  </behavior>
  <read_first>
    - .planning/PROJECT.md (verbatim non-negotiable values for astro.config.mjs)
    - .planning/phases/01-scaffold-and-content-schema/01-CONTEXT.md (specifics block, `global.css` contents)
    - Current `tsconfig.json` (Quartz-shaped — must be fully replaced, not merged)
    - node_modules/astro/package.json (confirm Astro 6 is installed after Task 1)
  </read_first>
  <action>
    Step 1 — Create `astro.config.mjs` at repo root with exactly this content (verbatim from PROJECT.md):

    ```js
    import { defineConfig } from "astro/config";
    import tailwindcss from "@tailwindcss/vite";

    export default defineConfig({
      site: "https://wahengchang.github.io",
      base: "/ai-study-note",
      trailingSlash: "always",
      build: { format: "directory" },
      vite: { plugins: [tailwindcss()] },
    });
    ```

    Do not add `integrations`, `markdown`, `output`, or any other keys — Phase 3 and later own those.

    Step 2 — Overwrite `tsconfig.json` entirely with:

    ```json
    {
      "extends": "astro/tsconfigs/strict",
      "include": [".astro/types.d.ts", "**/*"],
      "exclude": ["dist"]
    }
    ```

    Notes:
    - Strips every Quartz-era compiler option (jsx preact, noUnusedLocals, experimentalDecorators, etc.) — Astro's strict preset supplies sane defaults.
    - `.astro/types.d.ts` is needed so `astro:content` types resolve in Plan 03.

    Step 3 — Create `src/styles/global.css` with exactly:

    ```css
    @import "tailwindcss";
    @plugin "@tailwindcss/typography";
    ```

    Step 4 — Create a minimal placeholder `src/pages/index.astro` so `astro build` has an entry point to emit. Phase 3 will replace this:

    ```astro
    ---
    import "../styles/global.css";
    ---
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>AI Study Note — scaffold</title>
      </head>
      <body>
        <h1>Scaffold placeholder — Phase 3 will replace this</h1>
      </body>
    </html>
    ```

    Step 5 — Run a full smoke build:

    ```bash
    npm run build
    ```

    Expected outcomes:
    - Exit code 0
    - `dist/ai-study-note/index.html` exists (base path applied to output)
    - `dist/ai-study-note/index.html` contains an `<h1>` element and a linked/inlined Tailwind stylesheet

    If the build fails, read the error, fix root cause, and re-run. Do NOT mark done until the build is green.

    Step 6 — Confirm `dist/` is ignored:
    ```bash
    git check-ignore dist/
    ```
    Must succeed (from Plan 01's `.gitignore` update — if Plan 01 has not landed yet in this wave, `dist/` will show up in `git status`; that is acceptable for parallel execution and will reconcile on merge).
  </action>
  <verify>
    <automated>test -f astro.config.mjs && grep -q '"/ai-study-note"' astro.config.mjs && grep -q 'trailingSlash: "always"' astro.config.mjs && grep -q 'format: "directory"' astro.config.mjs && grep -q "tailwindcss()" astro.config.mjs && test -f tsconfig.json && grep -q "astro/tsconfigs/strict" tsconfig.json && test -f src/styles/global.css && grep -q '@import "tailwindcss"' src/styles/global.css && grep -q '@plugin "@tailwindcss/typography"' src/styles/global.css && test -f src/pages/index.astro && npm run build && test -f dist/ai-study-note/index.html</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c '"/ai-study-note"' astro.config.mjs` returns 1
    - `grep -c 'site: "https://wahengchang.github.io"' astro.config.mjs` returns 1
    - `grep -c 'trailingSlash: "always"' astro.config.mjs` returns 1
    - `grep -c 'format: "directory"' astro.config.mjs` returns 1
    - `grep -c "tailwindcss()" astro.config.mjs` returns 1
    - `grep -c "astro/tsconfigs/strict" tsconfig.json` returns 1
    - `grep -c "jsxImportSource" tsconfig.json` returns 0 (Quartz preact config gone)
    - `grep -c '@import "tailwindcss"' src/styles/global.css` returns 1
    - `grep -c '@plugin "@tailwindcss/typography"' src/styles/global.css` returns 1
    - `npm run build` exits 0
    - `test -f dist/ai-study-note/index.html` succeeds
    - `grep -c "<h1>" dist/ai-study-note/index.html` >= 1
  </acceptance_criteria>
  <done>`astro.config.mjs`, `tsconfig.json`, `src/styles/global.css`, and `src/pages/index.astro` all on disk with the exact content above. `npm run build` completes with exit 0 and produces `dist/ai-study-note/index.html`. No Quartz-era TypeScript options remain in `tsconfig.json`.</done>
</task>

</tasks>

<verification>
After both tasks:

```bash
# Deps resolved and installed
test -d node_modules/astro && test -d node_modules/@tailwindcss/vite && test -d node_modules/@tailwindcss/typography

# Config files present with correct values
grep -q "/ai-study-note" astro.config.mjs
grep -q 'trailingSlash: "always"' astro.config.mjs
grep -q 'format: "directory"' astro.config.mjs
grep -q "tailwindcss()" astro.config.mjs
grep -q "astro/tsconfigs/strict" tsconfig.json
grep -q '@plugin "@tailwindcss/typography"' src/styles/global.css
[ "$(cat .nvmrc)" = "22" ]

# Build green and base-path correct
npm run build
test -f dist/ai-study-note/index.html

# Nothing Quartz left in package.json
! grep -q "quartz" package.json
```

All commands must exit 0 (or exit 1 for the negation grep).
</verification>

<success_criteria>
- SCAF-01: Astro 6.x installed; `.nvmrc` pins Node 22 (>=22.12 satisfied)
- SCAF-02: `@tailwindcss/vite` + `tailwindcss` + `@tailwindcss/typography` installed and wired — `astro.config.mjs` calls `tailwindcss()`; `global.css` registers the typography plugin
- SCAF-03: `astro.config.mjs` contains `site: "https://wahengchang.github.io"`, `base: "/ai-study-note"`, `trailingSlash: "always"`, `build.format: "directory"`
- `npm run build` completes with zero errors and emits `dist/ai-study-note/index.html`
- `package.json` contains zero references to Quartz (script names, binaries, keywords, or dependencies)
</success_criteria>

<output>
After completion, create `.planning/phases/01-scaffold-and-content-schema/02-SUMMARY.md` per the standard summary template. Record the resolved exact versions of astro, @tailwindcss/vite, tailwindcss, @tailwindcss/typography (run `npm ls --depth=0 --json | jq` and include the version numbers) — Plan 03 and later phases will reference these.
</output>
