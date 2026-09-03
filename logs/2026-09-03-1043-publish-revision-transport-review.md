# PublishRevision transport review hardening

- **Cycle**：`cycle-2026-08-29-1002-cms-issue-backlog`
- **完成時間**：2026-09-03T10:43:00+08:00
- **狀態**：PR #302 review 後的補強，仍等待外部 reviewer 合併。

## 交付

- `publishSuccess`／`saveSuccess` 改以 `PublishRevisionSuccessDto`／`SaveRevisionSuccessDto` 標註回傳型別：server 投影與 client strict schema 漂移時是 compile error，而不是 runtime `INVALID_SERVER_RESPONSE`。`publishedRevisionId` 在 `EntryPointerRecord` 是 optional，缺值時 fail closed 回 `500`，不送出缺欄位的 receipt。
- 三個 route 的 body 上限與 remediation 收斂為具名常數；`POST /_local/server-proof` 的 `REQUEST_BODY_TOO_LARGE` 不再誤用 SaveRevision 的「4 MiB」說明（該 route 上限是 4 KiB）。
- publish rejection 覆蓋補齊 contract §7 要求的 proof set：old（rotate 後舊 key）、query transport、`X-Forwarded-*`、exact origin 缺 same-origin Fetch Metadata、`GET`、malformed JSON，以及每個 case 的 `routeTemplate` 與 `asn_` canary。
- 成功 publish 增加 log assertion：`AUTHORING_REQUEST_OK` + `/v1/entries/:entryId/publish`。
- oversized body 的 remediation 納入斷言（publish 4 KiB、save 4 MiB、proof 4 KiB）。
- `contracts/README.md` §7 同步 publish transport 與 typed client 的已實作現況（原文只列 `POST /v1/entries/:entryId/revisions`，與 PR 內 `docs/INDEX.md` 的敘述衝突）。

## 關鍵決策

- 不新增 `cms:publish-revision` CLI：#279 的 Delivery 只涵蓋 transport 與 typed client seam，CLI 屬另一張票。
- `Host` 不符時 request URL 不落在核准 origin，route 無法歸屬，log 只能記 `unmatched`；此行為以測試固定下來，而非改動 log 語意。

## 實際驗證

- runtime：Node `v22.22.2`、npm `10.9.7`；與 contract 指定 Node `24.20.0`／npm `11.19.0` 不同（`npm ci --engine-strict=false`）。
- `node --import tsx --test tests/apps/authoring-api/http-contract.test.ts`：12/12 通過。
- `npm run check`：typecheck、`check:architecture`、162/162 test 全數通過。

## 已知限制／後續

- client 在 `SERVER_PROOF_GENERATION_MISMATCH` 後的一次 retry 仍無自動化覆蓋（SaveRevision 亦同）：需要在 client 讀取 credential 與 server admission 之間插入 rotation 的競態，暫不以測試固定。
- `LocalAuthoringClient.publishRevision` 目前只有測試呼叫端；production caller 待 CMS browser bootstrap（#280）或後續 publish CLI 票。

## Branch／PR

- branch：`cms/publish-revision-transport`
- PR：[#302](https://github.com/wahengchang/ai-study-note/pull/302)
