---
id: WG-012-authoring-cli-client
status: completed
title: Authoring CLI client
work_items: ["WI-038"]
owner: Main
branch: cms/authoring-cli-client
worktree: .dev-hub/worktrees/authoring-cli-client
pr: https://github.com/wahengchang/ai-study-note/pull/301
---

# Authoring CLI client

## Delivery
執行 GitHub #278 的 API-04：將既有 local credential、server proof 與 SaveRevision server transport 擴展為同 TCP connection proof-before-Bearer 的 CLI client。

## Verification
`node --import tsx --test tests/apps/authoring-api/credential-lifecycle.test.ts tests/apps/authoring-api/credential-cli.test.ts tests/apps/authoring-api/save-revision-cli.test.ts tests/apps/authoring-api/http-contract.test.ts`：21/21 通過。
`node --import tsx --test --test-name-pattern='shipped cms:save-revision' tests/apps/authoring-api/http-contract.test.ts`：1/1 通過，child process exit 0、stdout `AUTHORING_SAVE_REVISION_OK\n`、stderr 空白、current pointer 為 `command-revision`。
`node --import tsx --test --test-name-pattern='rogue listener|replaced connection|rotation' tests/apps/authoring-api/http-contract.test.ts`：3/3 通過；forged MAC 與 connection replacement 都不送 Bearer，credential rotation 後舊 key 立即失效。
`npm run typecheck && npm run check:architecture`：通過。`npm run check`：159/159 通過。
實際 runtime 為 Node v22.22.2／npm 10.9.7；與 contract 指定的 Node 24.20.0／npm 11.19.0 不一致，`npm ci` 會直接以 `EBADENGINE` 失敗，需 `--engine-strict=false`。限制已記錄於 `logs/2026-09-02-1647-authoring-cli-client.md` 與 `logs/2026-09-02-1716-authoring-cli-client-review.md`。

## Review
覆審（`52a6aba`）補上 fail-closed 修正與覆蓋率缺口：共用 `ENTRY_ID_PATTERN`、`setHeader`／`end` 的 try/catch、已 dispose snapshot 回 `CREDENTIAL_NOT_PROVISIONED`、`content` 拒絕 explicit `undefined`；並新增 rogue listener 測試、contract §7 response security header 與 no-CORS 覆蓋、CLI exit code 1 mapping。詳見 `logs/2026-09-02-1716-authoring-cli-client-review.md`。
