# ChangeRoute PR #303 複審與修正

- **完成時間**：2026-09-03T14:28:03+08:00
- **Work Item**：WI-023／GitHub #238
- **Work Group**：WG-014
- **狀態**：completed（複審後補強）

## 交付

- `core/site-definition/service.ts`：`validateRouteClaimReplacementInTransaction` 改由 issuer 自己保存的 `prepared` state 取得 target graph，不再讀取 caller-owned proposal 的 `claim.graph`。移除 identity 檢查前的兩個 caller-controlled property read（可 throw 的 accessor／TOCTOU 面），連帶讓外層 try/catch 不再必要。
- `tests/core/application/change-route.test.ts`：新增 SiteDefinition snapshot storage fault 的 observable test，證明 transaction 內 route graph 讀取失敗收斂為 `CHANGE_ROUTE_FAILED`（非 `STALE_ROUTE_PROPOSAL`）、canonical state 不變，且同一 proposal 在故障排除後仍可重用。
- `specs/cms-basic-contracts-v1/02-content-lifecycle-application-core.md`：「目前實作 surface」補上 ChangeRoute 段落，並記錄 SiteDefinition storage fault 與 stale digest 的分流對四個 command 的一致效果。
- `docs/INDEX.md`：復原 Content + Application 列被移除的 SaveRevision failures／media replacement／Plugin composition 測試連結與各 command 描述，同時保留 ChangeRoute；Site Definition 列補記 storage fault 分流。
- `core/application/application.ts`：移除多餘空行。

## 關鍵決策

- 不為 ChangeRoute 的 `STALE_ROUTE_PROPOSAL` 補 `subjectIds`：可用的 owner 只存在於未驗證的 caller proposal，讀取它會重新引入原作者刻意避開的 accessor 讀取路徑。改以 PR 說明記錄此取捨。
- 不為 published graph 的 pointer mismatch 另立 failure code：新增 public failure code 會擴張 transport contract surface，屬 Owner 決策，僅在 PR 中提出。
- ChangeRoute 不做 schema／media gate 經查證為正確：內容 bytes 未變更，且 `ArchiveAsset` 已被 active published reference gate 擋住，published pointer 不移動時 media set 不可能退化。

## 實際驗證

- Node v22.22.2／npm 10.9.7（contract engines 為 Node 24.20.0／npm 11.19.0；以 `--engine-strict=false` 安裝）。
- `npm run check`：typecheck、check:architecture 與 167/167 測試通過（複審前基準為 166/166）。
- 反向驗證：暫時還原 `validateClaim` 的 storage-failure 分流後，新測試如預期失敗（`not ok 5`），確認該測試確實鎖住本 PR 引入的行為。

## 已知限制／後續

- `changeRoute` 尚未接上 authoring transport；本 PR 只先把 `INVALID_CHANGE_ROUTE_REQUEST`／`CHANGE_ROUTE_FAILED` 加入 `authoringErrorStatuses` 對照，與 `RestoreRevision` 現況一致。
- ChangeRoute 在 published graph 的 pointer mismatch 仍回報 `CURRENT_REVISION_MISMATCH`，訊息已泛化為「目前 revision 已變更，請重新確認後再執行命令」；診斷精確度待 Owner 決定是否新增 code。
- ChangeRoute 目前先 apply claim 再做 pointer gate（靠 transaction rollback 保證原子性），而非 CMS-CORE-02 字面上的「寫入前完成 preflight」順序；要改成先 gate 需讓 SiteDefinition 從 token 公開權威 claim，屬契約變更。
