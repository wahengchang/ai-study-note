---
phase: 01-scaffold-and-content-schema
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - quartz/
  - quartz.config.ts
  - quartz.layout.ts
  - .gitignore
autonomous: true
requirements:
  - SCAF-04

must_haves:
  truths:
    - "`quartz/` directory does not exist in the working tree"
    - "`quartz.config.ts` does not exist in the working tree"
    - "`quartz.layout.ts` does not exist in the working tree"
    - "`.gitignore` contains no Quartz-specific lines (`public/`, `.quartz/`, `.quartz-cache/`)"
    - "`content/` directory is preserved untouched (Phase 2 owns migration)"
  artifacts:
    - path: ".gitignore"
      provides: "Clean ignore list with only Astro-relevant entries"
      contains: "dist/"
  key_links:
    - from: "working tree"
      to: "absence of Quartz engine"
      via: "git rm of quartz/, quartz.config.ts, quartz.layout.ts"
      pattern: "! -e quartz AND ! -e quartz.config.ts AND ! -e quartz.layout.ts"
---

<objective>
Remove the Quartz v4 engine from the working tree so the Astro scaffold in Plan 02 lands on clean ground.

Purpose: SCAF-04 requires no Quartz files survive the migration. Doing this first — in parallel with the Astro install in Plan 02 (no file overlap) — keeps the tree coherent.

Output: `quartz/`, `quartz.config.ts`, `quartz.layout.ts` deleted; `.gitignore` stripped of Quartz entries and updated for Astro's `dist/` output.

Note: `package.json` and `tsconfig.json` Quartz cleanup is owned by Plan 02, which overwrites both files wholesale as part of the Astro scaffold (no merge conflict risk).
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
@.gitignore
</context>

<tasks>

<task type="auto">
  <name>Task 1: Delete Quartz engine directory and config files</name>
  <files>quartz/, quartz.config.ts, quartz.layout.ts</files>
  <read_first>
    - .planning/PROJECT.md (confirm SCAF-04 non-negotiable)
    - .planning/phases/01-scaffold-and-content-schema/01-CONTEXT.md (confirm "To Remove" list)
    - Verify current working branch is `feat/astro-migration` via `git branch --show-current`
  </read_first>
  <action>
    Verify you are on branch `feat/astro-migration`. If not, STOP and surface the mismatch — do not switch branches automatically.

    Run exactly:
    ```bash
    git rm -rf quartz/
    git rm -f quartz.config.ts
    git rm -f quartz.layout.ts
    ```

    Do NOT touch `content/`, `docs/`, `claude/`, `skills/`, `.planning/`, `CLAUDE.md`, `README.md`, `package.json`, or `tsconfig.json`. Those are owned by other plans or must remain.

    If any of the three deletion targets is already absent (already removed manually), record that in the summary and move on — do not fail.
  </action>
  <verify>
    <automated>test ! -e quartz && test ! -e quartz.config.ts && test ! -e quartz.layout.ts && test -d content && test -d docs && test -d claude && test -f CLAUDE.md</automated>
  </verify>
  <acceptance_criteria>
    - `test ! -e quartz` exits 0 (directory gone)
    - `test ! -e quartz.config.ts` exits 0
    - `test ! -e quartz.layout.ts` exits 0
    - `test -d content` exits 0 (content preserved for Phase 2)
    - `test -d docs && test -d claude && test -f CLAUDE.md` exits 0 (non-targets untouched)
    - `git status --porcelain | grep -E "^D  (quartz/|quartz\.config\.ts|quartz\.layout\.ts)"` shows deletions staged
  </acceptance_criteria>
  <done>Three deletion targets absent from working tree; deletions staged in git; preserved directories (content/, docs/, claude/) untouched.</done>
</task>

<task type="auto">
  <name>Task 2: Strip Quartz entries from .gitignore and add Astro dist/</name>
  <files>.gitignore</files>
  <read_first>
    - .gitignore (read current contents — 30 lines, contains `public/`, `.quartz/`, `.quartz-cache/`)
    - .planning/phases/01-scaffold-and-content-schema/01-CONTEXT.md ("To Remove" block lists the exact `.gitignore` lines)
  </read_first>
  <action>
    Rewrite `.gitignore` to remove Quartz-specific entries and add Astro's build output. Replace the entire file with exactly:

    ```
    # Dependencies
    node_modules/

    # Build outputs
    dist/
    *.tsbuildinfo

    # OS/editor
    .DS_Store
    ._*
    .vscode/

    # Logs
    *.log
    npm-debug.log*
    yarn-debug.log*
    yarn-error.log*

    # Env
    .env
    .env.*

    # Astro
    .astro/

    # Automation
    .automation/
    ```

    Key changes vs current:
    - Remove `public/` (Astro uses `public/` as a source directory, not output)
    - Remove `.quartz/`
    - Remove `.quartz-cache/`
    - Add `dist/` (Astro default build output)
    - Add `.astro/` (Astro's generated types + cache directory)
    - Replace "Quartz caches" comment with "Astro"

    Do not add ESLint/Prettier entries — leave those decisions for later.
  </action>
  <verify>
    <automated>grep -q "^dist/$" .gitignore && grep -q "^\.astro/$" .gitignore && grep -q "^node_modules/$" .gitignore && ! grep -qE "^public/$|^\.quartz/$|^\.quartz-cache/$" .gitignore</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "^dist/$" .gitignore` returns 1
    - `grep -c "^\.astro/$" .gitignore` returns 1
    - `grep -c "^node_modules/$" .gitignore` returns 1
    - `grep -E "^(public/|\.quartz/|\.quartz-cache/)$" .gitignore` returns nothing (exits 1)
    - `grep -c "Quartz" .gitignore` returns 0 (no leftover Quartz comments)
  </acceptance_criteria>
  <done>`.gitignore` contains `dist/` and `.astro/`, no longer contains `public/`, `.quartz/`, `.quartz-cache/`, or any "Quartz" substring; file is valid git ignore format (no syntax errors — `git check-ignore` can be invoked).</done>
</task>

</tasks>

<verification>
After both tasks:

```bash
# Nothing Quartz left at the root
test ! -e quartz && test ! -e quartz.config.ts && test ! -e quartz.layout.ts

# .gitignore is clean and Astro-ready
grep -q "^dist/$" .gitignore
grep -q "^\.astro/$" .gitignore
! grep -qE "^(public/|\.quartz/|\.quartz-cache/)$" .gitignore

# Preserved directories intact
test -d content && test -d docs && test -d claude && test -d .planning && test -f CLAUDE.md
```

All commands must exit 0 (or exit 1 for the negation).
</verification>

<success_criteria>
- `quartz/`, `quartz.config.ts`, `quartz.layout.ts` deleted from working tree and staged in git
- `.gitignore` stripped of `public/`, `.quartz/`, `.quartz-cache/`; includes `dist/` and `.astro/`
- `content/`, `docs/`, `claude/`, `CLAUDE.md`, `.planning/` all untouched
- No modifications to `package.json` or `tsconfig.json` (Plan 02 owns those files)
</success_criteria>

<output>
After completion, create `.planning/phases/01-scaffold-and-content-schema/01-SUMMARY.md` per the standard summary template. Note explicitly that `package.json` and `tsconfig.json` Quartz cleanup is handled by Plan 02.
</output>
