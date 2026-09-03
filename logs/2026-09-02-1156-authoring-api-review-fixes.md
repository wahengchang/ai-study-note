# Authoring API review fixes

- **Cycle**：`cycle-2026-08-29-1002-cms-issue-backlog`（WG-011 後續）
- **完成時間**：2026-09-02T11:56:53+08:00
- **狀態**：completed

## 交付

- 補齊 contract §7 對 HTTP child 強制的 actual-listener proof list：新增 21 個 transport rejection case（missing／malformed／duplicate／invalid／old／revoked key、evil Host、`Forwarded`／`X-Forwarded-*`、evil Origin、`OPTIONS`／`GET`、cookie／query、415、4 MiB 上限、404 route），並在同一測試內證明零 canonical mutation、log envelope 欄位固定、response／log 無 `asn_v1_` canary。
- `response()` 在序列化後統一 redact，success DTO 不再原樣回吐 credential 形狀字串；`domainError()` 的逐欄位 redaction 因此移除。
- credential store：atomic rename 之後補 directory fsync；stale lock 於同一次 transition 內回收並重試一次；directory 驗證改為 `O_NOFOLLOW|O_DIRECTORY` fd 上的 stat／fchmod，symlink 目標不會在被回絕前先被 `chmod`；rename 後驗證失敗改回報 `CREDENTIAL_STORE_COMMITTED_UNVERIFIED`。
- `/v1/entries/:entryId/revisions` 拒絕含 `%` 的 entryId segment；`/_local/server-proof` 與 `/v1/*` 一致拒絕 cookie 與 query。
- 新增 `apps/authoring-api/origin.ts` 集中 origin／host／port 與 credential 字面 pattern；CLI 由 `apps/authoring-api/index.ts` 匯出，對齊 `apps/cli` 既有慣例。

## 關鍵決策

- entryId 在 transport 層直接拒絕 percent-encoding（回 `404 ROUTE_NOT_FOUND`），而非在 domain 層補救：route regex 比對未解碼 pathname、Hono param 卻會解碼，兩者不一致才是根因。
- rename 之後的驗證失敗另立 failure code，而非沿用 `CREDENTIAL_STORE_FAILURE`：此時舊 key 已失效，回報成「未寫入」會誤導呼叫端。
- directory fsync 失敗採 best-effort（不推翻已 commit 的 rename），僅在 platform 不支援時靜默略過。

## 實際驗證

- `npm run check`：**151 tests 通過**（原 142），typecheck 與 architecture checker 通過。
- 修正前以暫時性探針實測確認問題存在：symlink 目標 mode `755 → 700` 後才回 `CREDENTIAL_STORE_UNSAFE`；stale lock 下 `rotate` 第一次必定 `CREDENTIAL_STORE_BUSY`；`/v1/entries/a%2Fb/revisions` 回 `200` 並存出 `entryId: "a/b"`；success DTO 原樣回吐 `asn_v1_` 形狀字串。上述四項現在都有回歸測試。

## 已知限制／後續

- server proof 的 socket 綁定、5 秒 one-mint、browser ticket mint／consume／expiry 與 session exchange 仍由 #280 交付；在此之前 `POST /_local/server-proof` 對本機 process 沒有次數限制。
- `/cms` 與 `/cms/*` history fallback、CSP 與 built assets 尚未實作。

## 相關 Branch／PR

- Branch：`cms/authoring-credential-review-fixes`（base：`cms/authoring-credential-save-revision`）
- 對應審查：PR #299 的 review 意見 P1–P7 與 O1–O5。
