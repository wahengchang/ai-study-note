# Deferred Items — Phase 01 Scaffold and Content Schema

Items discovered during execution but out of scope for the current plan.

## Pre-existing Noise

### Non-monotonic git pack index warnings

- **Source:** `.git/objects/pack/._pack-*.idx` — macOS metadata files created in the git pack directory.
- **Symptom:** Every `git status`/`git rm` prints stderr lines like `error: non-monotonic index .git/objects/pack/._pack-<sha>.idx`.
- **Scope:** Pre-existing repo noise unrelated to the Astro migration. `npm run clean` exists in the current `package.json` to wipe macOS `._*` files project-wide; that hygiene lives in Plan 02 when `package.json` is rewritten.
- **Impact:** Cosmetic — git operations still succeed and exit-codes remain correct.
- **Suggested resolution:** A later plan (or ad-hoc hygiene pass) can `find .git/objects/pack -name "._*" -delete`. Out of scope here because Plan 01 must not touch `package.json` and cannot invoke `npm run clean`.
