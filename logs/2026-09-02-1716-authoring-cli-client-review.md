# Authoring CLI client 覆審與強化

- 完成時間：2026-09-02T17:16+08:00
- Work Group：WG-012-authoring-cli-client
- Branch：`cms/authoring-cli-client`
- PR：[https://github.com/wahengchang/ai-study-note/pull/301](https://github.com/wahengchang/ai-study-note/pull/301)

## 交付

- `origin.ts` 新增共用的 `ENTRY_ID_PATTERN`；`authoring-client.ts` 與 `save-revision-cli.ts` 不再各自寫死同一份 entryId 字面格式。
- `requestSave` 的 `setHeader`／`end` 包在 try/catch：header 已 flush 時改回 `AUTHORING_CONNECTION_CHANGED`，不讓 socket listener 內的 throw 逃成 uncaught exception 而讓 CLI 直接崩潰。
- credential snapshot 已 dispose 時的 empty `authorizationHeader()` 改回 `CREDENTIAL_NOT_PROVISIONED`，不再誤報為 `AUTHORING_CONNECTION_FAILED`。
- `saveRevisionRequestSchema.content` 拒絕 explicit `undefined`：`JSON.stringify` 會整個丟掉該 key，原本 client 會放行一個 listener 必定以 `INVALID_REQUEST_BODY` 拒絕的 body。
- 新增 rogue listener 測試：假 listener 佔用 fixed origin 時，client 在 forged MAC 與 connection replacement 兩種情況都不送 Bearer，且 rogue 端看不到任何 `asn_` 形狀字串。
- 新增 contract §7 的 response security header 覆蓋：success 與全部 21 個 rejected shape 都驗 `no-store, no-cache`／`no-cache`／`nosniff`／`no-referrer`，並驗證不回任何 CORS header 或 `Location`。
- 新增 CLI exit code 1 覆蓋（`CREDENTIAL_NOT_PROVISIONED`）與缺 `content` 的 request file 覆蓋，補齊 Issue #278 要求的 exit 0/1/2 mapping。

## 關鍵決策

- rogue listener 測試放在 `http-contract.test.ts`：`node --test` 是以檔案為單位平行執行，另開檔案會與既有 listener 搶 `127.0.0.1:43127`。
- `content` 只擋 `undefined`，未改用 deep `z.json()`：wire 上的值一律來自 `JSON.parse`，deep walk 對 4 MiB body 只是重複成本。

## 實際驗證

- `npm run check`：159/159 通過（覆審前為 154/154）。
- `node --import tsx --test tests/apps/authoring-api/http-contract.test.ts`：9/9 通過。
- `node --import tsx --test tests/apps/authoring-api/save-revision-cli.test.ts`：3/3 通過。
- 覆審期間以獨立 probe 實測：forged MAC 得 `AUTHORING_SERVER_PROOF_INVALID`、無 listener 得 `AUTHORING_CONNECTION_FAILED`、generation mismatch 之後重讀 credential 並成功 retry 一次（proof 呼叫 2 次、Bearer 只在第二次有效 proof 之後送出）。

## 已知限制／後續

- `AUTHORING_SAVE_TIMEOUT`（30 秒）與 success DTO 的 `INVALID_SERVER_RESPONSE` 都不是安全的 abort：listener 可能已經 commit revision，CLI 卻回報 exit 1。目前沒有 read-back 或 idempotent retry，重試會撞到 `CURRENT_REVISION_MISMATCH`。
- server 尚未把成功的 challenge 以 WeakMap 綁 TCP socket（contract §7 的 5 秒／one-mint 規則屬於 browser-ticket minting）。同 connection 的保證目前只由 client 端強制，API-05 不得假設 server 側已存在。
- `POST /_local/server-proof` 依 contract 是 unauthenticated，且每次 request 都重讀 credential file，沒有 rate limit。
- 本機實際 runtime 仍是 Node `v22.22.2`／npm `10.9.7`；`package.json` engines 要求 Node `24.20.0`／npm `11.19.0`，`npm ci` 會直接以 `EBADENGINE` 失敗，需 `--engine-strict=false`。環境中找不到 Node 24。
