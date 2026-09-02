---
id: WG-012-authoring-cli-client
status: completed
title: Authoring CLI client
work_items: ["WI-038"]
owner: Main
branch: cms/authoring-cli-client
worktree: .dev-hub/worktrees/authoring-cli-client
pr: null
---

# Authoring CLI client

## Delivery
執行 GitHub #278 的 API-04：將既有 local credential、server proof 與 SaveRevision server transport 擴展為同 TCP connection proof-before-Bearer 的 CLI client。

## Verification
`node --import tsx --test tests/apps/authoring-api/credential-lifecycle.test.ts tests/apps/authoring-api/credential-cli.test.ts tests/apps/authoring-api/save-revision-cli.test.ts tests/apps/authoring-api/http-contract.test.ts`：16/16 通過。
`node --import tsx --test --test-name-pattern='shipped cms:save-revision' tests/apps/authoring-api/http-contract.test.ts`：1/1 通過，child process exit 0、stdout `AUTHORING_SAVE_REVISION_OK\n`、stderr 空白、current pointer 為 `command-revision`。
`node --import tsx --test --test-name-pattern='connection replacement|rotation' tests/apps/authoring-api/http-contract.test.ts`：credential rotation 1/1 通過。
`npm run typecheck && npm run check:architecture`：通過。`npm run check`：154/154 通過。
實際 runtime 為 Node v22.22.0／npm 10.9.4；與 contract 指定的 Node 24.20.0／npm 11.19.0 不一致，限制已記錄於 `logs/2026-09-02-1647-authoring-cli-client.md`。
