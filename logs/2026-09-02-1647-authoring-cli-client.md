# Authoring CLI client

- 完成時間：2026-09-02T16:47:58+08:00
- Work Group：WG-012-authoring-cli-client
- Branch：`cms/authoring-cli-client`
- PR：建立前為 `null`

## 交付

- 將 API-03 的 `487387b9567ef80bb482954dd5797144408063a5` 以 `git cherry-pick --no-commit` 納入 API-04 第一筆交付。
- 新增唯一 versioned wire DTO、error status allowlist、每次 fresh secure credential read、proof-before-Bearer 同 TCP connection SaveRevision client，以及 `cms:save-revision` executable。
- CLI 僅接受 `--entry-id` 與 JSON input file；固定 success/failure output 與 exit code，不讀 key environment。
- actual listener contract test 覆蓋 shipped executable round-trip 與 canonical current pointer；文件同步標示 API-04 已實作，browser ticket/session 仍未實作。

## 關鍵決策

- client/executable 維持在 `apps/authoring-api`，未建立 app-to-app dependency、PublishRevision 或 browser bootstrap 抽象。
- Bearer 只在 proof DTO、generation、nonce 與 HMAC 通過後，且 `socket === proofSocket`、`reusedSocket === true` 時加入尚未送出的 Save request。

## 實際驗證

- `node --import tsx --test tests/apps/authoring-api/credential-lifecycle.test.ts tests/apps/authoring-api/credential-cli.test.ts tests/apps/authoring-api/save-revision-cli.test.ts tests/apps/authoring-api/http-contract.test.ts`：16/16 通過。
- `node --import tsx --test --test-name-pattern='shipped cms:save-revision' tests/apps/authoring-api/http-contract.test.ts`：1/1 通過；child process exit `0`、stdout 為 `AUTHORING_SAVE_REVISION_OK\n`、stderr 空白，current pointer 為 `command-revision`。
- `node --import tsx --test --test-name-pattern='connection replacement|rotation' tests/apps/authoring-api/http-contract.test.ts`：credential rotation 1/1 通過。
- `npm run typecheck && npm run check:architecture`：通過。
- `npm run check`：154/154 通過。

## 已知限制／後續

- 本機實際 runtime 為 Node `v22.22.0`、npm `10.9.4`；與 contract 指定的 Node `24.20.0`、npm `11.19.0` 不一致，但上述命令已在實際 runtime 通過。未找到 `nvm`、`fnm`、`volta`、`mise` 或 `node24`。
- API-05、browser ticket/session、`/cms/*` bootstrap 不在本 Work Group 範圍。
