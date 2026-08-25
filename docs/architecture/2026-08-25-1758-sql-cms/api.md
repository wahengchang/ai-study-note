# localhost automation API 契約

## Boundary

Base URL 固定為 `http://127.0.0.1:<configured-port>/api/v1`。server 只接受 loopback；browser request 必須 exact Host/Origin 且沒有 CORS。沒有 Origin 的 local CLI 視為 OS-trusted。API 沒有 Git/build/deploy、Navigation、Settings、public read endpoint。

JSON payload 在 HTTP adapter 以 Zod 驗證，然後轉成 service command；service 回 domain result，adapter 才轉 HTTP body。所有 unbounded list 都用 opaque `cursor`，禁止 offset-as-contract。

## Owner-method contract

| resource | methods | owner service | success | preconditions |
|---|---|---|---|---|
| Post Type | `GET/POST /post-types`、`GET /post-types/{id}` | PostTypeService | list 200；create 201；get 200 | create：Idempotency-Key |
| schema | `POST /post-types/{id}/schema-versions`、version GET、publish/archive/unarchive | PostTypeService + RouteMigrationService | create 201；其餘 200 | existing mutation：If-Match + Idempotency-Key |
| Taxonomy | `GET/POST /taxonomies`、GET/version/publish/archive/unarchive | TaxonomyService + RouteMigrationService | list/get 200；create/version 201 | create：Idempotency-Key；existing mutation：both |
| Term | list/create/get/revision/get revision/publish/archive/unarchive under `/taxonomies/{id}/terms` | TermService + PublishTermRevisionService | list/get 200；create/revision 201 | create：Idempotency-Key；existing mutation：both |
| Entry | `GET/POST /entries`、get/revision/get revision/preview/publish/unpublish/archive/unarchive | EntryService + RouteMigrationService | list/get/command 200；create/revision 201 | create/preview：Idempotency-Key；other mutation：both |
| Media | `GET/POST /media`、`GET/PATCH /media/{id}`、archive/unarchive | MediaUploadService + MediaReconciliationService | list/get/patch/command 200；upload 201 | upload：Idempotency-Key；existing mutation：If-Match；archive commands：both |

Field 沒有獨立 PATCH；僅能提交完整 schema payload 建新 immutable version，歷史 field 由 schema-version GET 取得。Media 沒有 DELETE。每個 `openapi.json` operationId 與上表一對一。

## ETag

Create/upload 不需要 `If-Match`。所有 existing aggregate mutation 必須以 owner row monotonic `resource_version` strong ETag 做 precondition，並在同一 transaction compare/increment。Entry Save/Publish/Unpublish/Archive 同樣只用 `entries.resource_version`；immutable revision ETag 只可用於 cache，不能當 aggregate precondition。

缺 `If-Match` 回 `428 PRECONDITION_REQUIRED`；不匹配回 `412 PRECONDITION_FAILED`。同一初始 ETag 的第一個 mutation 成功後，所有後續 command 必為 412。

## Idempotency

所有 POST create/command 需要 `Idempotency-Key`。`idempotency_keys` 對 `(operation_scope,key)` unique，保存 canonical request hash、`pending|completed|failed`、lease、HTTP status/headers/body、outcome kind/id、operation log ID、24h expiry。

| condition | response |
|---|---|
| same hash, completed | exact recorded status/header/body |
| same hash, pending | 409 `IDEMPOTENCY_IN_PROGRESS` + `Retry-After` |
| same key, different hash | 409 `IDEMPOTENCY_CONFLICT` |
| deterministic 4xx | recorded/replayed 4xx |
| transient 5xx after lease | same hash may reclaim; first find/finalize existing outcome |

DB-only command 在一個 transaction 完成 domain outcome、operation log、idempotency completed response，因此 crash 只會全 commit 或全 rollback。media command 依 [media.md](media.md) 的 durable intent/outcome protocol；不允許 second asset/outcome。

## Error body

所有 error body 為：

```json
{ "code": "VALIDATION", "message": "human-readable summary", "details": {} }
```

`code` 只可為 `VALIDATION`、`NOT_FOUND`、`PRECONDITION_REQUIRED`、`PRECONDITION_FAILED`、`ROUTE_CONFLICT`、`REFERENCE_CONFLICT`、`SCHEMA_MIGRATION_REQUIRED`、`STORAGE_FAILED`、`IDEMPOTENCY_IN_PROGRESS`、`IDEMPOTENCY_CONFLICT`。`openapi.json` 為 exact path/method/header/body/responses machine contract。Publish 只改 local pointers/claims/operation log，絕不 build/deploy。
