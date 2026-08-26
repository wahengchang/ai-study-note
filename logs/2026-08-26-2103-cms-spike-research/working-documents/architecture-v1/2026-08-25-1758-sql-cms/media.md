# 媒體 storage 與恢復契約

## Ownership 與 path

`media_objects` 擁有 physical bytes：checksum unique、storage key、MIME、byte size、dimensions、`staging|ready|deleting|error` state、temp/final paths、nullable idempotency ID 與 resource version。`media_assets` 是 logical metadata owner：object FK、title、description、alt、caption、original filename、resource version、archive marker、`ever_referenced_at`。

Original final path 固定：

```text
media/originals/<sha256[0:2]>/<sha256>.<normalized-ext>
```

Duplicate bytes 建立另一 asset 時必須重用同一 ready object。Media 沒有 draft/published；Entry revision reference 決定其出現在 working 或 published projection。

## Upload durable phases

只允許 JPEG、PNG、WebP、GIF、AVIF、PDF，單檔最多 25 MiB。spool 時拒絕 empty/corrupt、MIME/extension mismatch、path traversal 與超限檔案。

| phase | durable state | process-kill/restart 唯一處理 |
|---|---|---|
| 0. receive | `media/.tmp/` only | orphan temp 依 request hash/idempotency lease 清除 |
| 1. claim | `idempotency_keys` pending + lease | same hash 查 existing outcome；pending 回 409 `Retry-After` |
| 2. intent | transaction 寫 staging object、asset intent、operation outcome IDs | DB rollback 則 temp 清除；DB commit 則繼續找到同一 intent |
| 3. promote | atomic temp→final rename | final exists 且 checksum 正確：進 ready；temp exists：retry rename；兩者皆無：error/recoverable failure |
| 4. finalize | transaction object `ready`、activate asset、exact response、idempotency completed | 同一 outcome replay exact response，不新增 asset |

Upload 先 spool 並計算 request/file hash。claim idempotency 後，同一 transaction 建 pending operation、staging object/asset intent，將唯一 idempotency row durable 綁定 outcome IDs。commit 後才 atomic rename；第二 transaction 才 ready/activate/complete。Startup `MediaReconciliationService` 以 idempotency/outcome IDs、DB row、file existence、checksum 決定完成或回滾。lease reclaim 必須先查 outcome 再 finalize/replay，絕不建立第二 outcome/asset。

| 異常 | 唯一處理 |
|---|---|
| duplicate bytes | reuse checksum ready object，建立新 asset metadata |
| temp missing、final valid | verify checksum 後 finalize ready |
| final missing、temp valid | retry atomic rename |
| temp/final checksum mismatch | object `error`、idempotency transient failure，bytes 不可當 ready |
| orphan temp | 僅在無 live/pending matching intent 時移除 |
| orphan staging object | reconciliation 依 outcome 回滾；無 asset owner/pending outcome 才可清除 |

## Retention 與 archive

Asset Archive 只設 archive marker，保留 asset→object ownership 與 bytes。V1 沒有 Media hard delete/purge。任何 historical/current/published revision reference 都永久保留 asset/object；僅從未被任何 reference 使用且 `ever_referenced_at IS NULL` 的 failed/abandoned asset intent 可由 reconciliation 清除。shared object 只有沒有任何 asset owner且沒有 pending idempotency outcome時，才可 `deleting → unlink → delete`；archive 單一 asset 絕不可刪 shared bytes。

## Git boundary

在 repository 確認 private 後，canonical DB 和 `media/originals/` 才可加入 Git；`media/.tmp/`、SQLite journal、generated preview 必須忽略。若 repository 仍 public，future tooling 必須 fail closed，阻擋完整 DB/media commit，同時保留 authoring files untracked。每次 manual stage 前依 [database.md](database.md) 的 write barrier 驗證 object ready、無 temp、DB/fingerprint/manifest 完整。

本次 gate 以 durable-state fixture 驗證可表示的 state、shared ownership、archive retention 與 idempotency uniqueness；未來實作必須為上表每個 phase 補 process-kill integration test。
