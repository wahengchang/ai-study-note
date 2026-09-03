# PublishRevision transport

- **Cycle**：`cycle-2026-08-29-1002-cms-issue-backlog`
- **完成時間**：2026-09-03T10:06:07+08:00
- **狀態**：WG-013 完成，等待外部 reviewer 合併 PR。

## 交付

- `POST /v1/entries/:entryId/publish`：strict `publish-revision-request/v1`、safe `publish-revision-success/v1` receipt，以及既有 Authoring API security gate。
- `LocalAuthoringClient.publishRevision`：和 SaveRevision 共用同 TCP socket 的 proof-before-Bearer、一次 credential generation retry 與 fail-closed response validation。
- actual-listener contract proof：成功、stale conflict、typed client、auth/origin/host/media/body/route rejection、canonical state／command seam、credential canary、rogue listener 與 replaced connection。
- `docs/INDEX.md` 同步 Authoring API 現況；browser ticket/session bootstrap 仍未實作。

## 關鍵決策

- success DTO 只投影 revision identity/schema/digest/lineage、published pointer/route、lineage identity 與 state digest；不回傳 content、credential、Persistence internals 或 Projection/build/release 結果。
- PublishRevision 僅經 `core/application/index.ts` 的 `DomainApplication.publishRevision` public seam；不觸發 Projection、build 或 release。

## 實際驗證

- runtime：Node `v22.22.0`、npm `10.9.4`；與 contract 指定 Node `24.20.0`／npm `11.19.0` 不同。
- `node --import tsx --test tests/apps/authoring-api/http-contract.test.ts`：12/12 通過。
- `npm run typecheck`：通過。
- `npm run check:architecture`：通過。
- `npm run check`：162/162 通過。

## 已知限制／後續

- 本機 runtime 與 contract 指定版本不一致；未使用 `--engine-strict=false` 安裝。
- API-06／#280 仍受 #257、WI-031 及 WI-023/WI-028/WI-029 前置與 API-05 PR 合併阻擋；本 Work Group 不實作 browser ticket/session。

## Branch／PR

- branch：`cms/publish-revision-transport`
- PR：尚未建立（第一個 commit 時 `pr: null`）。
