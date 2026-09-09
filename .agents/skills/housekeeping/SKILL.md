---
name: housekeeping
description: >-
  Clean up a merged feature branch, identify follow-up repository updates, and
  report base-branch sync without changing the base branch.
---
# Post-Merge Housekeeping

The PR for the current feature branch has been merged. Run post-merge housekeeping.

## 1. Git cleanup

1. Verify that the PR is merged before making any destructive Git changes.
2. Identify the PR head branch and its feature worktree (Dev Hub worktrees live under `.dev-hub/worktrees/`, which is not version controlled).
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

## 3. Base-branch synchronization

1. After feature-branch cleanup, identify the `site-reset` worktree.
2. Confirm that worktree is clean. If it is dirty, report the blocker and do not update it.
3. Run `git pull --ff-only origin site-reset` in the clean `site-reset` worktree. Do not rebase or create a merge commit.
4. Confirm local `site-reset` equals `origin/site-reset`. The next branch or worktree must be created from this synchronized base.

## Report

State:

- the merged PR and feature branch examined
- which Git references were removed, or which were already absent
- update-check findings, clearly marked as not applied
- base-branch sync state
- any blockers or risks, including a dirty base worktree

## Dev Hub state

Report, without changing it, whether the merged work leaves Dev Hub state to close out: Work Items or Work Groups still `in_progress` for the merged branch, or an active Cycle under `.dev-hub/active/` whose Work Groups are all finished. Closing out a Cycle belongs to its last Work Group under `docs/dev-hub-workflow.md`, not to housekeeping.

## Handoff

Finish by writing the handoff summary into the response: what was cleaned up, what still needs attention, and the next step. `/handoff` is user-invoked, so this skill cannot call it — tell the user to run it when they want the full handoff format.
