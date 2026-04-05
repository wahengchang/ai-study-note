Act as a Teammember, working on the project for this repo (in zh-tw).

## Invariants (never violate)

- **`.automation/` is local state — never stage or commit it.** The tracker file `.automation/issues.json` is read-write only on the local filesystem. Never use `git add .`, `git add -A`, `git add .automation/...`, or `git commit -a`. Stage files by explicit path only.
- **Always verify branch state before any work.** Do not trust cached status. Run `git rev-parse --abbrev-ref HEAD` and `git status --porcelain` each run.
- **Branch off fresh `origin/main`, not current HEAD.** `git fetch origin && git checkout -B auto/issue-<n> origin/main`. Never branch from whatever you happen to be on.
- **One issue per branch, one branch per PR.** Never bundle restructures, cleanups, or unrelated fixes into an issue branch. If you notice unrelated work needed, file a separate issue.
- **Working tree must be clean before starting.** If `git status --porcelain` is non-empty (excluding `.automation/` and other gitignored paths), abort and report — do not stash-and-hope.

## On each run

1. **Preflight checks.**
   - `repo`/`git`/`gh` are usable.
   - `git fetch origin` succeeds.
   - Current working tree is clean (per the invariant above).
2. Load `.automation/issues.json` (read only — never stage it afterward).
3. **Check tracked open PRs first.**
   - If a PR has new comments/review comments, checkout that PR branch and update it in place.
   - If a PR branch is outdated relative to `main` (behind base, merge conflicts, or failing checks due to base drift):
     a. Rebase onto `origin/main`: `git fetch origin && git rebase origin/main`.
     b. Resolve conflicts.
     c. **Check for tracked `.automation/` files** after rebase: `git ls-files .automation/`. If any appear, run `git rm --cached -r .automation/` and amend/commit the cleanup as part of the sync.
     d. Re-run validation and `git push --force-with-lease`. Do not close and reopen the PR.
4. **Pick one open issue** to work on per run (lowest number first).
   - Skip issues whose status is `in_progress` (another instance may be working on it).
   - If issue already has an open PR, skip it.
   - If unclear, leave a clarification comment, mark `clarification_needed`, and stop.
   - If already fixed, mark `done` and stop.
   - If small and actionable:
     a. Mark the issue `in_progress` in the tracker immediately (before starting work).
     b. **Branch fresh from `origin/main`**: `git fetch origin && git checkout -B auto/issue-<number> origin/main`. Do not reuse a stale local branch — recreate it from `origin/main` every run.
     c. Implement, validate, commit (staging files by explicit path only), push, and create one PR.
     d. On success mark `pr_open`; on validation failure mark `failed`.
   - If too large/unsafe, mark `blocked` and stop.
5. Only work on that single issue. Do not process additional issues in the same run.
6. Record every decision in the tracker.
7. **Before every commit**, verify the staged diff with `git diff --cached --stat` and confirm no `.automation/` or unrelated paths are included.
8. Never create empty commits/PRs. Never open multiple PRs for one issue or multiple issues in one PR.
