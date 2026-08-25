# SQLite 資料庫契約

## Runtime 與 durability

canonical DB 固定為 `data/cms.sqlite`。每個 connection 啟動必須執行：

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = DELETE;
PRAGMA synchronous = FULL;
PRAGMA busy_timeout = 5000;
```

同一 Node API process 必須序列化 writes；跨 process 不屬 V1 支援模型。所有 command 的 domain outcome、operation log、idempotency completed response 必須同一 SQLite transaction commit，媒體 upload 的兩階段例外見 [media.md](media.md)。

## Schema source 與 migration ledger

`migrations/*.sql` 是唯一 schema source of truth。`schema.sql` 是從 empty DB 按 filename 順序套用 migration 後，以 sorted/normalized `sqlite_schema` 生成的 readonly snapshot，**禁止手改**。`db:init` 只套 migration，且每個 migration 的同一 transaction 寫入 application-owned `schema_migrations(migration_id, sequence, filename, sha256, applied_at)`。

每次啟動／checkpoint 必須 fail closed：ledger 缺檔、ledger ahead、sequence 不連續、filename/hash 被改寫、schema fingerprint 不同或 schema drift 任一項都中止。`verify-contract.mjs` 重建 fresh DB，驗證 ledger、fingerprint 與 snapshot 等價。

## Relational ownership

| area | mutable owner | immutable history / relationship |
|---|---|---|
| content schema | `post_types` | `post_type_schema_versions`、`field_definitions`、`field_definition_versions` |
| taxonomy | `taxonomies`、`terms` | `taxonomy_versions`、`taxonomy_version_post_types`、`term_revisions` |
| content | `entries` | `entry_revisions`、`entry_field_values`、`revision_terms` |
| routes | `route_claims` | owner/source checks by trigger |
| media | `media_assets`、`media_objects` | revision references are permanent |
| commands | `idempotency_keys` | `operation_log` durable outcome audit |

All owner rows carry monotonic positive `resource_version`, archive marker and timestamps where applicable. `entry_revisions` includes every projected core field: title/description/excerpt/slug/body/parent/cover/schema version/revision number. Schema version, field version, term revision, entry revision, field value and revision-term rows have BEFORE UPDATE/DELETE abort triggers. V1 has no hard delete or runtime history purge.

## Field-value constraints and queries

`entry_field_values` is one scalar per row. `(entry_revision_id, field_definition_version_id, ordinal)` is unique; many values consume `ordinal`, while a single value is constrained to ordinal zero. `kind` and mutually exclusive typed columns represent text, integer, real, boolean, ISO date, UTC datetime, media asset and relation entry. A membership trigger enforces that the Entry revision’s pinned schema and Post Type match the field definition version; a kind trigger enforces type storage mapping. Required presence stays a Publish service cross-row validation.

Partial indexes exist for integer, real, date, datetime, text/select, media and relation typed values. The query layer may only filter/sort fields declared filterable/sortable by that definition version; GFM is never filterable/sortable. Additional indexes cover pointers, route claims, taxonomy parent/slug, revision terms and media checksums.

## Route source integrity

`route_claims` is intentionally polymorphic, so standard FKs cannot express ownership. Owner-kind-specific checks in both BEFORE INSERT and BEFORE UPDATE triggers provide FK-equivalent validation:

- entry ↔ same Entry `entry_revisions`
- post type archive ↔ same Post Type `post_type_schema_versions`
- taxonomy archive ↔ same Taxonomy `taxonomy_versions`
- term archive ↔ same Term `term_revisions`
- reserved ↔ all owner/source fields NULL and a non-null reserved key

Canonical path is globally UNIQUE. It is a service responsibility to canonicalize before insert; the database is the final constraint boundary.

## Checkpoint, Git and backup

Manual Git staging requires a write barrier: stop CMS/API, ensure every media object is `ready` and `media/.tmp/` is empty, then `db:checkpoint` runs integrity check, foreign-key check, migration ledger/hash/schema fingerprint and media manifest checksum. Only a passing DB + media pair may be staged.

Backup uses the SQLite backup API to make a consistent DB copy and pairs it with the same-barrier media manifest. Restore reruns all checks before becoming canonical. A future history compaction requires a separate downtime `copy-reachable-graph → verify → atomic DB replacement` plan; it may never drop/disable immutability triggers.
