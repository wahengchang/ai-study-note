# localhost automation API 契約

本文件是 API 討論結果與審核輸入，**不是** source of truth；不得單獨建立、推翻或裁定 API 決策。

候選版：`api-contract-2026-08-25-07`。`openapi.json` 是 path、method、header、request、response 與 error code 的機械討論結果；本文定義 application-service、冪等、分頁、ETag 與系統邊界語意。兩者不得分歧。

## Boundary

Base URL 固定為 `http://127.0.0.1:<configured-port>/api/v1`。server 只接受 loopback；browser request 必須符合 configured exact Host/Origin，且 server 不提供 CORS。沒有 Origin 的 local CLI 視為 OS-trusted single owner。

API 只管理 local SQL canonical authoring state 與 local media。它沒有 public read API、Git、build、deploy、Navigation 或 Settings 能力。Publish 只在單一 local transaction 內改 current/published pointer、route claim 與 operation log；公開 static output、Theme 與 release/deploy 必須另由 published projection 契約處理。

JSON payload 在 HTTP adapter 以 OpenAPI 對應的封閉 Zod schema 驗證後，轉成唯一 application-service method 的 typed command；service 回 typed domain result，adapter 才轉 HTTP status、header 與 body。adapter 不直接呼叫 repository、RouteMigration、Idempotency 或 Reconciliation。

## operationId 與 application-service owner

每個 `operationId` 只映射一個 public application-service method；method 名稱全域唯一，不能由多個 route 共用。`RouteMigrationService`、`PublishTermRevisionService`、`IdempotencyCoordinator`、`MediaReconciliationService` 與 storage adapter 僅為 application service 內部協作者，不是 route owner，也不出現在 `x-application-service-method`。

| application service | operationId → method |
|---|---|
| `PostTypeApplicationService` | `listPostTypes` → `listPostTypes`；`createPostType` → `createPostType`；`getPostType` → `getPostType`；`createPostTypeSchemaVersion` → `createSchemaVersion`；`getPostTypeSchemaVersion` → `getSchemaVersion`；`publishPostType` → `publishPostType`；`archivePostType` → `archivePostType`；`unarchivePostType` → `unarchivePostType` |
| `TaxonomyApplicationService` | `listTaxonomies` → `listTaxonomies`；`createTaxonomy` → `createTaxonomy`；`getTaxonomy` → `getTaxonomy`；`createTaxonomyVersion` → `createVersion`；`getTaxonomyVersion` → `getVersion`；`publishTaxonomy` → `publishTaxonomy`；`archiveTaxonomy` → `archiveTaxonomy`；`unarchiveTaxonomy` → `unarchiveTaxonomy` |
| `TermApplicationService` | `listTerms` → `listTerms`；`createTerm` → `createTerm`；`getTerm` → `getTerm`；`createTermRevision` → `createRevision`；`getTermRevision` → `getRevision`；`publishTermRevision` → `publishRevision`；`archiveTerm` → `archiveTerm`；`unarchiveTerm` → `unarchiveTerm` |
| `EntryApplicationService` | `listEntries` → `listEntries`；`createEntry` → `createEntry`；`getEntry` → `getEntry`；`createEntryRevision` → `createRevision`；`getEntryRevision` → `getRevision`；`previewEntry` → `previewEntry`；`publishEntry` → `publishEntry`；`unpublishEntry` → `unpublishEntry`；`archiveEntry` → `archiveEntry`；`unarchiveEntry` → `unarchiveEntry` |
| `MediaApplicationService` | `listMedia` → `listMedia`；`createMedia` → `createMedia`；`getMedia` → `getMedia`；`updateMedia` → `updateMedia`；`archiveMedia` → `archiveMedia`；`unarchiveMedia` → `unarchiveMedia` |

完整 route 清單與既有 `operationId` 固定於 `openapi.json`，不得重新命名或擴張 surface。Field 沒有獨立 PATCH，只能提交完整 schema payload建立 immutable schema version；Media 沒有 DELETE。

## Idempotency

所有 POST create/command 與 `PATCH /media/{id}` 都需要 `Idempotency-Key`。scope 是 OpenAPI 每個 mutation 的固定 `x-idempotency-scope`，格式為 `<aggregate>.<operation>`；同一 operation 的所有 resource id 共用 scope，因此 key 必須由 client 在該 operation 內全域唯一。storage 的唯一鍵是 `(operation_scope, key)`；V1 completed record 與 operation log 不可刪除，key 不得重用，`expires_at` 僅供 pending lease reclaim 判定。

Canonical request hash 是下列值依固定欄位順序形成 canonical record、以 UTF-8 編碼後計算 SHA-256；不得納入 Host、Origin、連線資訊或非列名 header：

1. uppercase HTTP method；
2. route template 展開後的 canonical path：UTF-8 percent-encoding 正規化、移除 dot segment、保留規定的 trailing slash 語意；
3. route parameters以參數名排序的 decoded scalar，及 query 以 key、value 排序的完整 multimap；不存在與空字串不可互換；
4. lowercase header 名與 trim/OWS-normalized 值：`content-type`、`if-match`；`idempotency-key` 本身不進 hash；
5. JSON body 以 RFC 8785 JSON Canonicalization Scheme 的 UTF-8 bytes；沒有 body 使用零長度 bytes；multipart 只 canonicalize 非 file 欄位；
6. media upload 的原始 file bytes SHA-256 digest 與 byte length；非 media request 使用明確的 null digest marker。

處理順序固定：驗證 Idempotency-Key 格式 → 以 scope/key 讀取紀錄並比對 hash → 若 `completed`，在讀取 aggregate 或檢查 `If-Match` 前原樣 replay 已記錄的 status、headers、body → 若 `pending` 回 409 `IDEMPOTENCY_IN_PROGRESS` 與 `Retry-After` → 同 key 不同 hash 回 409 `IDEMPOTENCY_CONFLICT` → 只有新 request 或合法 lease reclaim 才做 `If-Match` 與 domain work。因此已完成 request 即使 owner ETag 後來改變，仍 replay 原成功結果。

deterministic 4xx 會記錄並重播；transient storage 5xx 不完成紀錄，lease 到期後同 hash 可 reclaim，但必須先 find/finalize 已存在 outcome。DB-only command 在同一 transaction 完成 domain outcome、operation log 與 completed response。media command 使用 durable intent/outcome reconciliation，禁止產生第二個 asset 或 outcome。

## Stable cursor pagination

所有 list operation 都接受 opaque `cursor` 與 `includeArchived`（default `false`）。每個 page body 都必須包含 `items` 與 required、nullable 的 `nextCursor`；沒有下一頁時回 JSON `null`，不得省略。第一頁使用 server 固定 page size；後續 cursor 綁定 operationId、page size、`includeArchived`、父層 route parameter、完整 filter/query、排序版本與最後 sort tuple。client 不可解碼或修改 cursor。

排序是 deterministic total order：Post Type、Taxonomy、Entry 與 Media 依 `(createdAt ASC, id ASC)`；Term 在指定 taxonomy 內依 `(createdAt ASC, id ASC)`。相同資料集與相同 filter 的 cursor 不得重複或跳過 item；不得使用 offset。並行新增且排在已簽發 cursor 之後的資料可在後頁出現，並行 archive/update 可改變後頁可見性，API 不宣稱 snapshot isolation。

`includeArchived=false` 時 archived aggregate 完全不出現在 list；`true` 時 active 與 archived 都出現且每個 item 的 `lifecycleState` 明確標示。單筆 GET 仍可取得 archived aggregate。cursor 無法驗證簽章／版本、已過期、operation/filter/parent 不符或 sort tuple 非法，一律回 400 `VALIDATION`，`details.reason=INVALID_CURSOR`；`includeArchived` 非 boolean 時同樣回 400 `VALIDATION`，`details.reason=INVALID_INCLUDE_ARCHIVED`；兩者都不得默默重開第一頁或改寫 query。

## Lifecycle response

所有 aggregate response 都有 `resourceVersion` 與 `lifecycleState`。Post Type、Taxonomy 為 `draft | published | modified | archived`；Entry、Term 為 `draft | published | modified | unpublished | archived`；Media 為 `ready | archived`。immutable schema version/revision 則以 non-empty、unique 的 `lifecycleStates` 回 `current`、`published`、`historical` membership；同一 immutable row 可同時包含 `current` 與 `published`，兩者皆無時只包含 `historical`。這是相對於目前 owner pointer 的 projection，不使 immutable row 可變。Preview result 回 entry 當下 lifecycle state。

OpenAPI request、aggregate、version、revision、preview、mutation result 與 list page 都使用資源專屬、封閉、明確 `type`／`required`／nullable 的 schema。不得加入 `additionalProperties: true`、無 properties 的 arbitrary object，或 generic `Resource`、`Command`、`Create` schema。

## ETag 與 mutation result

owner aggregate row 的 monotonic `resource_version` 是唯一 mutation precondition。strong ETag wire format固定為 `"<resourceVersion>"`。Create/upload 不需要 `If-Match`；所有 existing aggregate mutation（包含 Media PATCH）需要 strong owner `If-Match`，並在同一 transaction compare/increment。缺 header 回 428 `PRECONDITION_REQUIRED`；不符回 412 `PRECONDITION_FAILED`。

每個 aggregate mutation 成功 body 都是資源專屬 result，內含更新後 owner aggregate 與其 `resourceVersion`，response 同時回與該版本完全一致的 required strong `ETag`。建立 immutable schema version/revision 的 201 也回 owner aggregate + 新 version/revision，且 ETag 仍屬 owner aggregate。Entry save/publish/unpublish/archive 只比較 `entries.resource_version`。

immutable schema-version/revision GET 必須接受 `If-None-Match`；當內容 digest ETag 相符時回 `304` 並回相同 ETag、不帶 body，否則回 `200` 與 representation。它標記為 `cache-only`，不得供 `If-Match`、不得替代 owner ETag，也不是 mutation response ETag。Preview 沒有 aggregate mutation ETag。

## Error contract

所有 error body 都是封閉 schema，固定包含 `code`、`message`、`details`；每個 operation/status 在 OpenAPI 中列出精確可回 code。通用對應為 400 `VALIDATION`、404 `NOT_FOUND`、412 `PRECONDITION_FAILED`、428 `PRECONDITION_REQUIRED`、503 `STORAGE_FAILED`。409 依 operation 只可包含所列 domain conflict 與 `IDEMPOTENCY_IN_PROGRESS | IDEMPOTENCY_CONFLICT`；只有 in-progress response 帶 `Retry-After`，因此 409 header 是 conditional。

所有會存取 canonical store 的 operation 都宣告 503。只有存在 path target、parent 或 request reference 的 operation 宣告 404；root list，以及不帶 reference 的 Post Type／Taxonomy create、Media upload 不宣告虛假的 404。validation、not-found、precondition 與 storage code 不得跨 status 使用。
