# CMS product 與 lifecycle 契約

## V1 product model

CMS 固定模組：Dashboard、Post Types、Entries、Taxonomies、Media。OS-trusted single owner 經 localhost 使用；不實作任何 identity/authorization model。Publish 只變更 local canonical state；CMS 不做 Git、commit、push、build 或 deploy。

所有內容 Post Type 的 Entry revision 都包含 immutable identity、`title`、`description`、`excerpt`、`slug`、nullable cover media asset、body、parent、publish pointers 與 timestamps。Media 是獨立 asset aggregate，沒有 cover、slug、route 或 publish lifecycle。

## 不可變 schema

`post_types` 僅保存 immutable `key`、current/published schema pointer、`resource_version` 與 `archived_at`。一次 schema Save 必須寫一個新的 `post_type_schema_versions`，並提供該版完整 field set；歷史 schema/version/definition row 永不得 UPDATE 或 DELETE。

Field identity 的 `key` immutable。每個 field definition version 固定：label、help、type、cardinality (`single`/`many`)、required、default、validation、stable select options、editor group/order、public visibility、filterable、sortable。V1 types 僅為：

`text`、`textarea`、`gfm`、`integer`、`number`、`boolean`、`date`、`datetime`、`url`、`select`、`multiselect`、`media`、`relation`。

taxonomy assignment 不屬 field。type/cardinality/options/validation 任一改變只能建新 schema version；V1 永不 runtime purge schema 或 field history。Entry revision pin `post_type_schema_version_id`；required/type/cardinality migration 必須產生新 Entry revision backfill，舊 revision/value byte-for-byte 保持不變。

## 路由與 RouteMigrationService

- `page` 與 `post` 共用 root namespace，single 均為 `/{path}/`；page 預設 hierarchical，post flat。
- custom Post Type version 必填 `route_base`、`has_archive`、`hierarchical`，single 是 `/{route_base}/{path}/`，archive 是 `/{route_base}/`；custom 預設 flat。
- 路徑依序 trim segment、Unicode NFC、case-fold claim key、UTF-8 percent encode output，且永遠 trailing slash；拒絕 empty、`.`、`..`、embedded slash。
- 全域 domain 包含 page/post、custom single/archive、taxonomy/term archive 與 reserved routes。

`route_claims` 的 `owner_kind` 僅可為 `entry`、`post_type_archive`、`taxonomy_archive`、`term_archive`、`reserved`。同 owner 的 current/published 同 path 合併成一 row。SQLite BEFORE INSERT/UPDATE trigger 必須拒絕 wrong-kind、orphan owner/source、cross-owner source；reserved 只能 owner/source 全 NULL。

唯一 `RouteMigrationService` 必須在同一 SQLite transaction：計算 hierarchical Entry 或 Term slug/parent move 的 descendant closure、先驗證所有新 claim、acquire 新 claims、更新 pointers、釋放舊 claims。current graph 與 published graph 必須分開計算與遷移；modified descendant 的 current draft 永不被 published migration 覆蓋。任一 collision（例如 Page `/product/` 對 Product/Taxonomy base）則整批 rollback，既有 paths/pointers 不變。Post Type/Taxonomy archive base 也使用此 service。

| 命令 | current claim | published claim |
|---|---|---|
| Save | atomic acquire/replace | 保留舊 published claim |
| Publish | current path 成為 published path | 釋放不再 current 的舊 published claim |
| Unpublish | 保留 | 清除 |
| Archive | 清除所有 non-reserved claim | 清除 |
| Unarchive | 必須重新 acquire；collision 409 並保留 archived | 不建立 |

## Taxonomy 與 Term

`taxonomies` 保存 immutable key、current/published version pointer、resource version/archive marker。`taxonomy_versions` 保存 flat/hierarchical、attached Post Types、route base、term archive switch。`terms` 保存 taxonomy identity、current/published revision pointer、resource version、`first_published_at`、`archived_at`；`term_revisions` 保存 name、slug、description、parent、taxonomy version。Entry 的 assignments 一律由 `revision_terms` 指向特定 immutable `term_revision_id`。

`PublishTermRevisionService` 是唯一發布 Term version 的 service 與 batch command：

1. 由舊 published term revision 找出所有 affected published Entries。
2. 若 Entry `current_revision_id = published_revision_id`，clone published revision，僅換 term revision，current/published pointer 同時指向 clone。
3. 若 Entry modified，clone published revision 並僅移動 published pointer；working draft/current pointer 不變。
4. 更新 term published pointer、所有 affected route claims；任一 schema/reference/route error 全批 rollback。
5. Idempotency replay 僅回傳原 batch result，絕不再建 revision。

## Entry state machine

Entry 每次 Save 建 immutable revision 並只移動 current pointer；Preview 只讀 current；Publish 完整驗證成功才移動 published pointer。

| 優先序 | 條件 | state |
|---:|---|---|
| 1 | `archived_at IS NOT NULL` | `archived` |
| 2 | published NULL 且 `first_published_at IS NULL` | `draft` |
| 3 | published NULL 且 `first_published_at IS NOT NULL` | `unpublished` |
| 4 | current = published | `published` |
| 5 | current != published | `modified` |

Unpublish 清 published pointer，保留 `first_published_at`；Archive 在同 transaction 設 marker、清 published pointer、釋放 claims；Unarchive 曾發布過則回 `unpublished`，否則回 `draft`。V1 沒有 Entry hard delete 或 immutable-history purge。route-affecting Post Type version 在所有 affected current/published Entries 完成新 revision 與 global claim transaction 前不可 Publish。

## Long-form GFM

`body_source` 為 UTF-8，`body_format = "gfm"`，`body_schema_version = 1`。第一階段只有 source editor 與 CMS GFM preview。允許 CommonMark/GFM 基本段落、heading、list、link、image、blockquote、table、strikethrough、task list、autolink 和 fenced code；Publish validation 拒絕 raw HTML、MDX、inline script。fenced code 永遠作為 escaped text，不執行。V1 不提供 directive、embed、widget、visual-editor round trip、Theme renderer precedence；field layout 只影響 CMS form，database 不保存 template/component code 或任意 HTML。
