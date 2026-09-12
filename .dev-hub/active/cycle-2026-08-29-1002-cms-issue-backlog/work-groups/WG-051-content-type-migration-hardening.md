---
id: WG-051
status: done
title: Content Type migration contract hardening
work_items: ["WI-070"]
owner: Main
branch: fix/content-type-migration-contract-hardening
worktree: /Volumes/UGREEN 2TB /projects/ai-study-note-reset/.dev-hub/worktrees/content-type-migration-hardening
pr: null
---

# Content Type migration contract hardening

修補 #282 的 remaining gaps：Application direct DTO fail-closed、schema-version collision 的 409 stale outcome、strict HTTP outcome DTO 與 blocked safe envelope。

## Verification

- `npm run typecheck`
- `node --import tsx --test tests/core/application/content-type-migration.test.ts tests/apps/authoring-api/http-contract.test.ts`：34/34 通過，含 fixed-origin actual listener、direct Application fail-closed、blocked envelope、foreign mapping、409 collision 與 admission rejection。
- `npm run check:architecture`
