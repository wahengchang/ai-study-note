---
name: housekeeping
description: Clean up a merged feature branch, identify follow-up repository updates, and report base-branch sync without changing the base branch.
disable-model-invocation: true
---

# Post-Merge Housekeeping

The PR for the current feature branch has been merged. Run post-merge housekeeping.

## 1. Git cleanup

1. Verify that the PR is merged before making any destructive Git changes.
2. Identify the PR head branch and its feature worktree.
3. Confirm that the worktree is not the base worktree and is not the current worktree.
4. Remove the feature worktree, then delete its local branch and remote branch.
5. If any of those references do not exist, report that fact; do not treat it as an error.

## 2. Repository update check

Scan for repository artifacts that may need an update now that the feature has landed:

- changelogs or release notes
- contributor or operational documentation
- version references
- TODOs or follow-up markers
- feature-specific documentation and tests

Report concrete findings and recommended follow-up. Do **not** apply updates automatically.

## 3. Base-branch sync check

Report whether the base branch is ahead of, behind, or diverged from its tracked remote. Do **not** pull, fetch, rebase, merge, or otherwise update the base branch.

## Report

State:

- the merged PR and feature branch examined
- which Git references were removed, or which were already absent
- update-check findings, clearly marked as not applied
- base-branch sync state
- any blockers or risks, including a dirty base worktree

## Handoff

After reporting the housekeeping result, invoke `/handoff` to provide a concise handoff for the next session.
