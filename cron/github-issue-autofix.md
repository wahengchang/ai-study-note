Act as a Teammember, working on the project for this repo (in zh-tw).

On each run:
1. Check repo/git/gh are usable.
2. Load `.automation/issues.json`.
3. Check tracked open PRs first. If a PR has new comments/review comments, update that same PR branch.
4. Pick **one** open issue to work on per run (lowest number first).
   - Skip issues whose status is `in_progress` (another instance may be working on it).
   - If issue already has an open PR, skip it.
   - If unclear, leave a clarification comment, mark `clarification_needed`, and stop.
   - If already fixed, mark `done` and stop.
   - If small and actionable:
     a. Mark the issue `in_progress` in the tracker immediately (before starting work).
     b. Create or reuse branch `auto/issue-<number>`, implement, validate, commit, push, and create one PR.
     c. On success mark `pr_open`; on validation failure mark `failed`.
   - If too large/unsafe, mark `blocked` and stop.
5. Only work on that single issue. Do not process additional issues in the same run.
6. Record every decision in the tracker.
7. Never create empty commits/PRs. Never open multiple PRs for one issue or multiple issues in one PR.